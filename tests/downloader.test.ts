// Jest globals are available by default
const path = require("path");
const { EventEmitter } = require("events");

// ---- Mocks ----
const ensureDir = jest.fn().mockResolvedValue(undefined);
const fetchPlaylist = jest.fn();

// Mock fs-extra (used for ensureDirectory)
jest.mock("fs-extra", () => ({
  ensureDir,
  remove: jest.fn(() => Promise.resolve()),
}));

// Mock ytpl (used to fetch playlist metadata)
jest.mock("ytpl", () => ({
  __esModule: true,
  default: fetchPlaylist,
}));

// Mock node:child_process execFile (downloader now shells out to yt-dlp)
const execFileMock = jest.fn();
jest.mock("node:child_process", () => ({
  __esModule: true,
  execFile: execFileMock,
}));

/**
 * Create a fake ChildProcess with stdout/stderr streams and an async lifecycle.
 * The downloader listens to:
 *  - child.stdout 'data' (Destination / Merging lines, sometimes percent)
 *  - child.stderr 'data' (progress lines, percent)
 * and awaits:
 *  - child.on('exit', ...)
 *  - child.on('error', ...)
 */
function createMockChildProcess({
  stdoutChunks = [],
  stderrChunks = [],
  exitCode = 0,
  emitDelayMs = 5,
}: {
  stdoutChunks?: string[];
  stderrChunks?: string[];
  exitCode?: number;
  emitDelayMs?: number;
}) {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const proc = new EventEmitter();

  proc.stdout = stdout;
  proc.stderr = stderr;

  setTimeout(() => {
    stdoutChunks.forEach((chunk) => stdout.emit("data", Buffer.from(chunk)));
    stderrChunks.forEach((chunk) => stderr.emit("data", Buffer.from(chunk)));
    proc.emit("exit", exitCode);
  }, emitDelayMs);

  return proc;
}

describe("downloader library", () => {
  beforeEach(() => {
    ensureDir.mockClear();
    fetchPlaylist.mockReset();
    execFileMock.mockReset();
  });

  it("downloads a single video and reports progress", async () => {
    // Arrange: execFile should return a process whose stdout contains Destination line(s)
    // and stderr contains progress percent(s).
    execFileMock.mockImplementation((_file, _args, _opts) =>
      createMockChildProcess({
        stdoutChunks: ['Destination: "/tmp/video.mp4"\n'],
        stderrChunks: ["25%\n", "50%\n", "75%\n"],
        exitCode: 0,
      }),
    );

    const { downloadVideo } = require("../lib/downloader");

    const onProgress = jest.fn();
    const result = await downloadVideo(
      "https://youtu.be/video",
      "./output",
      onProgress,
    );

    // Assert result
    expect(result.filePath).toBe("/tmp/video.mp4");
    expect(onProgress).toHaveBeenCalled();

    // Assert we prepared output directory
    expect(ensureDir).toHaveBeenCalledWith(path.resolve("./output"));

    // Assert we invoked yt-dlp via execFile with expected args
    expect(execFileMock).toHaveBeenCalledTimes(1);
    const [file, args, opts] = execFileMock.mock.calls[0];

    expect(file).toBe("/usr/local/bin/yt-dlp");
    expect(Array.isArray(args)).toBe(true);
    expect(args).toEqual(
      expect.arrayContaining([
        "https://youtu.be/video",
        "--output",
        expect.stringContaining("output"),
        "--format",
      ]),
    );
    expect(opts).toEqual(
      expect.objectContaining({
        maxBuffer: expect.any(Number),
      }),
    );
  });

  it("downloads a playlist sequentially", async () => {
    fetchPlaylist.mockResolvedValue({
      title: "My Playlist",
      items: [
        { id: "one", title: "First Video" },
        { id: "two", title: "Second Video" },
      ],
    });

    // First item process
    execFileMock
      .mockImplementationOnce((_file, _args, _opts) =>
        createMockChildProcess({
          stdoutChunks: ['Destination: "/tmp/playlist/first.mp4"\n'],
          stderrChunks: ["10%\n", "60%\n"],
          exitCode: 0,
        }),
      )
      // Second item process
      .mockImplementationOnce((_file, _args, _opts) =>
        createMockChildProcess({
          stdoutChunks: ['Destination: "/tmp/playlist/second.mp4"\n'],
          stderrChunks: ["20%\n", "90%\n"],
          exitCode: 0,
        }),
      );

    const { downloadPlaylist } = require("../lib/downloader");

    const onProgress = jest.fn();
    const result = await downloadPlaylist(
      "https://youtu.be/playlist",
      "./playlists",
      onProgress,
    );

    // Asserts: folder name sanitization happens in library
    expect(result.folderPath).toContain("My_Playlist");
    expect(result.files).toEqual([
      "/tmp/playlist/first.mp4",
      "/tmp/playlist/second.mp4",
    ]);

    // Progress is called with objects for playlist progress
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ videoIndex: expect.any(Number) }),
    );

    // Two downloads = two execFile calls
    expect(execFileMock).toHaveBeenCalledTimes(2);

    // Ensure playlist folder created
    expect(ensureDir).toHaveBeenCalledWith(
      path.resolve("./playlists/My_Playlist"),
    );

    // Verify both calls target expected URLs (constructed from ids)
    const firstArgs = execFileMock.mock.calls[0][1];
    const secondArgs = execFileMock.mock.calls[1][1];
    expect(firstArgs).toEqual(
      expect.arrayContaining(["https://www.youtube.com/watch?v=one"]),
    );
    expect(secondArgs).toEqual(
      expect.arrayContaining(["https://www.youtube.com/watch?v=two"]),
    );
  });
});
