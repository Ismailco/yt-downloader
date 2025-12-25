jest.mock("@/utils/queue", () => {
  const downloadQueue = {
    getJob: jest.fn(),
  };

  return {
    __esModule: true,
    downloadQueue,
  };
});

jest.mock("@/utils/downloadToken", () => {
  return {
    __esModule: true,
    verifyDownloadToken: jest.fn(),
  };
});

jest.mock("fs", () => {
  return {
    __esModule: true,
    default: {
      promises: {
        stat: jest.fn(),
      },
      createReadStream: jest.fn(),
      constants: { R_OK: 4 },
    },
    promises: {
      stat: jest.fn(),
    },
    createReadStream: jest.fn(),
    constants: { R_OK: 4 },
  };
});

const { GET } = require("../../app/api/files/[jobId]/[file]/route");

const { downloadQueue } = require("@/utils/queue");
const { verifyDownloadToken } = require("@/utils/downloadToken");
const fs = require("fs");

describe("/api/files/[jobId]/[file]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 403 when token is invalid", async () => {
    downloadQueue.getJob.mockResolvedValue({
      id: "1",
      getState: jest.fn().mockResolvedValue("completed"),
    });
    verifyDownloadToken.mockReturnValue(false);

    const request = {
      url: "http://localhost/api/files/1/a.mp4?token=bad",
      headers: new Headers(),
    } as any;

    const response = await GET(request, {
      params: Promise.resolve({ jobId: "1", file: "a.mp4" }),
    });

    expect(response.status).toBe(403);
  });

  it("returns 409 when job is not complete", async () => {
    downloadQueue.getJob.mockResolvedValue({
      id: "2",
      getState: jest.fn().mockResolvedValue("active"),
    });

    const request = {
      url: "http://localhost/api/files/2/a.mp4?token=tok",
      headers: new Headers(),
    } as any;

    const response = await GET(request, {
      params: Promise.resolve({ jobId: "2", file: "a.mp4" }),
    });

    expect(response.status).toBe(409);
  });

  it("returns 416 for invalid range request", async () => {
    downloadQueue.getJob.mockResolvedValue({
      id: "3",
      getState: jest.fn().mockResolvedValue("completed"),
    });
    verifyDownloadToken.mockReturnValue(true);

    const statMock = fs.default?.promises?.stat;
    statMock.mockResolvedValue({ size: 10 });

    const headers = new Headers();
    headers.set("range", "bytes=999-1000");

    const request = {
      url: "http://localhost/api/files/3/a.mp4?token=tok",
      headers,
    } as any;

    const response = await GET(request, {
      params: Promise.resolve({ jobId: "3", file: "a.mp4" }),
    });

    expect(response.status).toBe(416);
    expect(response.headers.get("Content-Range")).toBe("bytes */10");
  });
});

export {};
