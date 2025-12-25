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

const { GET } = require("../../app/api/files/[jobId]/zip/route");

const { downloadQueue } = require("@/utils/queue");
const { verifyDownloadToken } = require("@/utils/downloadToken");

describe("/api/files/[jobId]/zip", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 403 when token is invalid", async () => {
    downloadQueue.getJob.mockResolvedValue({
      id: "10",
      getState: jest.fn().mockResolvedValue("completed"),
      returnvalue: {
        files: [
          { name: "a.mp4", path: "/data/storage/10/files/a.mp4", url: "/api/files/10/a.mp4?token=tok" },
          { name: "b.mp4", path: "/data/storage/10/files/b.mp4", url: "/api/files/10/b.mp4?token=tok" },
        ],
      },
    });
    verifyDownloadToken.mockReturnValue(false);

    const request = {
      url: "http://localhost/api/files/10/zip?token=bad",
      headers: new Headers(),
    } as any;

    const response = await GET(request, {
      params: Promise.resolve({ jobId: "10" }),
    });

    expect(response.status).toBe(403);
  });
});

export {};
