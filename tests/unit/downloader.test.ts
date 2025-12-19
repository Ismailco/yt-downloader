/**
 * Unit tests for downloader library.
 *
 * The downloader implementation executes `yt-dlp` via `node:child_process.execFile`
 * and optionally converts to mp3 via `fluent-ffmpeg`.
 *
 * These tests:
 * - Mock `execFile` to simulate yt-dlp progress + destination output
 * - Keep `fluent-ffmpeg` chain behavior so mp3 conversion logic is exercised
 * - Mock `fs-extra` + `ytpl` as needed
 */

const { EventEmitter } = require("events");

// ---- Mocks: child_process (yt-dlp) ----
const execFileMock = jest.fn();

jest.mock("node:child_process", () => ({
  __esModule: true,
  execFile: (...args) => execFileMock(...args),
}));

// ---- Mocks: ffmpeg chain (mp3 conversion) ----
jest.mock("fluent-ffmpeg", () => {
  return jest.fn(() => {
    const chain = {
      noVideo: jest.fn(() => chain),
      audioCodec: jest.fn(() => chain),
      audioBitrate: jest.fn(() => chain),
      format: jest.fn(() => chain),
      on: jest.fn((event, handler) => {
        if (event === "end") chain._onEnd = handler;
        if (event === "error") chain._onError = handler;
        return chain;
      }),
      save: jest.fn(() => {
        setImmediate(() => {
          if (chain._onEnd) chain._onEnd();
        });
        return chain;
      }),
    };
    return chain;
  });
});

// ---- Mocks: fs-extra ----
const ensureDir = jest.fn(() => Promise.resolve());
const remove = jest.fn(() => Promise.resolve());
const move = jest.fn(() => Promise.resolve());

jest.mock("fs-extra", () => ({
  ensureDir: (...args) => ensureDir(...args),
  ensureDirSync: jest.fn(),
  remove: (...args) => remove(...args),
  move: (...args) => move(...args),
}));

// ---- Mocks: ytpl ----
const ytplMock = jest.fn();
jest.mock("ytpl", () => ({
  __esModule: true,
  default: (...args) => ytplMock(...args),
}));

// Import after mocks are in place
const { downloadVideo, downloadPlaylist } = require("../../lib/downloader");

/**
 * Create a fake ChildProcess returned by execFile.
 * The downloader:
 * - listens to stdout/stderr 'data' events for progress/path
 * - awaits process end via 'exit' (and listens for 'error')
 */
function createExecFileProcess({
  stdoutChunks = [],
  stderrChunks = [],
  exitCode = 0,
  emitDelayMs = 0,
}) {
  const proc = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();

  setTimeout(() => {
    stdoutChunks.forEach((chunk) =>
      proc.stdout.emit("data", Buffer.from(chunk)),
    );
    stderrChunks.forEach((chunk) =>
      proc.stderr.emit("data", Buffer.from(chunk)),
    );
    proc.emit("exit", exitCode);
  }, emitDelayMs);

  return proc;
}

beforeEach(() => {
  jest.clearAllMocks();

  // Default: execFile returns a successful download with a Destination line.
  let call = 0;
  execFileMock.mockImplementation((_file, args, _opts) => {
    call += 1;

    // Extract the output template passed to yt-dlp: ["--output", TEMPLATE]
    const outIdx = Array.isArray(args) ? args.indexOf("--output") : -1;
    const template =
      outIdx >= 0 && typeof args[outIdx + 1] === "string"
        ? args[outIdx + 1]
        : `/tmp/output${call}.%(title)s.%(ext)s`;

    // Simulate a resolved destination path from the template
    const destinationPath = template
      .replace("%(title)s", `sample_${call}`)
      .replace("%(ext)s", "m4a");

    return createExecFileProcess({
      stdoutChunks: [`Destination: ${destinationPath}\n`],
      stderrChunks: ["50%\n"],
      exitCode: 0,
      emitDelayMs: 0,
    });
  });
});

describe("downloader library (unit)", () => {
  it("converts video downloads to mp3 when requested", async () => {
    const progressSpy = jest.fn();

    const result = await downloadVideo(
      "https://youtu.be/example",
      "/tmp/output",
      progressSpy,
      { format: "mp3" },
    );

    expect(result.format).toBe("mp3");
    expect(result.filePath.endsWith(".mp3")).toBe(true);

    // Progress callback should have been called at least once
    expect(progressSpy).toHaveBeenCalled();

    // Ensure output directory created
    expect(ensureDir).toHaveBeenCalled();

    // ffmpeg conversion invoked
    const ffmpeg = require("fluent-ffmpeg");
    expect(ffmpeg).toHaveBeenCalled();

    // Original file should be removed after conversion
    expect(remove).toHaveBeenCalled();
  });

  it("limits playlist downloads to selected video IDs", async () => {
    ytplMock.mockResolvedValue({
      title: "Test Playlist",
      items: [
        { id: "first", title: "First video" },
        { id: "second", title: "Second video" },
      ],
    });

    const result = await downloadPlaylist(
      "https://www.youtube.com/playlist?list=test",
      "/tmp/out",
      jest.fn(),
      {
        selectedVideoIds: ["second"],
        format: "mp3",
      },
    );

    expect(result.files).toHaveLength(1);
    expect(result.files[0].endsWith(".mp3")).toBe(true);

    // Only one download should be executed due to selection
    expect(execFileMock).toHaveBeenCalledTimes(1);

    // Ensure it downloaded the selected video (constructed URL includes id)
    const args = execFileMock.mock.calls[0][1];
    expect(args).toEqual(
      expect.arrayContaining(["https://www.youtube.com/watch?v=second"]),
    );
  });
});
