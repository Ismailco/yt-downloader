// Jest globals are available by default
const path = require("path");
const { EventEmitter } = require("events");

const ensureDir = jest.fn().mockResolvedValue(undefined);
const fetchPlaylist = jest.fn();
const execMock = jest.fn();

jest.mock("fs-extra", () => ({
  ensureDir,
}));

jest.mock("ytpl", () => ({
  __esModule: true,
  default: fetchPlaylist,
}));

jest.mock("youtube-dl-exec", () => ({
  exec: execMock,
}));

function createMockProcess({
  stdoutChunks = [],
  stderrChunks = [],
  destination,
}: {
  stdoutChunks?: string[];
  stderrChunks?: string[];
  destination?: string;
}) {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();

  const promise = new Promise<void>((resolve) => {
    setTimeout(() => {
      stdoutChunks.forEach((chunk) => stdout.emit("data", Buffer.from(chunk)));
      if (destination) {
        stdout.emit("data", Buffer.from(`Destination: ${destination}`));
      }
      stderrChunks.forEach((chunk) => stderr.emit("data", Buffer.from(chunk)));
      resolve();
    }, 5);
  }) as Promise<void> & { stdout: EventEmitter; stderr: EventEmitter };

  (promise as any).stdout = stdout;
  (promise as any).stderr = stderr;
  return promise;
}

describe("downloader library", () => {
  beforeEach(() => {
    ensureDir.mockClear();
    fetchPlaylist.mockReset();
    execMock.mockReset();
  });

  it("downloads a single video and reports progress", async () => {
    execMock.mockImplementation(() =>
      createMockProcess({
        stdoutChunks: ["25%", "50%", "75%"],
        destination: "/tmp/video.mp4",
      }),
    );

    const { downloadVideo } = require("../lib/downloader");

    const onProgress = jest.fn();
    const result = await downloadVideo(
      "https://youtu.be/video",
      "./output",
      onProgress,
    );

    expect(result.filePath).toBe("/tmp/video.mp4");
    expect(onProgress).toHaveBeenCalled();
    expect(execMock).toHaveBeenCalledWith(
      "https://youtu.be/video",
      expect.objectContaining({ output: expect.stringContaining("output") }),
      expect.any(Object),
    );
    expect(ensureDir).toHaveBeenCalledWith(path.resolve("./output"));
  });

  it("downloads a playlist sequentially", async () => {
    fetchPlaylist.mockResolvedValue({
      title: "My Playlist",
      items: [
        { id: "one", title: "First Video" },
        { id: "two", title: "Second Video" },
      ],
    });

    execMock
      .mockImplementationOnce(() =>
        createMockProcess({
          stdoutChunks: ["10%", "60%"],
          destination: "/tmp/playlist/first.mp4",
        }),
      )
      .mockImplementationOnce(() =>
        createMockProcess({
          stdoutChunks: ["20%", "90%"],
          destination: "/tmp/playlist/second.mp4",
        }),
      );

    const { downloadPlaylist } = require("../lib/downloader");

    const onProgress = jest.fn();
    const result = await downloadPlaylist(
      "https://youtu.be/playlist",
      "./playlists",
      onProgress,
    );

    expect(result.folderPath).toContain("My_Playlist");
    expect(result.files).toEqual([
      "/tmp/playlist/first.mp4",
      "/tmp/playlist/second.mp4",
    ]);
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ videoIndex: expect.any(Number) }),
    );
    expect(execMock).toHaveBeenCalledTimes(2);
    expect(ensureDir).toHaveBeenCalledWith(
      path.resolve("./playlists/My_Playlist"),
    );
  });
});
