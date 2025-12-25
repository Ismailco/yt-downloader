jest.mock("@/utils/queue", () => {
  const downloadQueue = {
    getJob: jest.fn(),
  };

  const downloadQueueEvents = {
    on: jest.fn(),
    off: jest.fn(),
  };

  return {
    __esModule: true,
    downloadQueue,
    downloadQueueEvents,
  };
});

const { GET } = require("../../app/api/jobs/[id]/events/route");

const { downloadQueue } = require("@/utils/queue");

async function readFirstSsePayload(response: Response): Promise<any> {
  expect(response.body).toBeTruthy();
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();

  const { value } = await reader.read();
  const text = decoder.decode(value || new Uint8Array());
  const dataLine = text
    .split("\n")
    .find((line) => line.startsWith("data: "));
  expect(dataLine).toBeTruthy();
  return JSON.parse((dataLine || "").slice(6));
}

describe("/api/jobs/[id]/events", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("emits complete immediately when job is already completed", async () => {
    downloadQueue.getJob.mockResolvedValue({
      id: "1",
      getState: jest.fn().mockResolvedValue("completed"),
      returnvalue: {
        downloadUrl: "/api/files/1/a.mp4?token=tok",
        files: [{ name: "a.mp4", url: "/api/files/1/a.mp4?token=tok" }],
        folderPath: "/data/storage/1/files",
      },
      progress: { percent: 100 },
      failedReason: null,
    });

    const response = await GET({} as any, {
      params: Promise.resolve({ id: "1" }),
    });

    const payload = await readFirstSsePayload(response);
    expect(payload.type).toBe("complete");
    expect(payload.files).toBeTruthy();
  });

  it("emits error immediately when job is already failed", async () => {
    downloadQueue.getJob.mockResolvedValue({
      id: "2",
      getState: jest.fn().mockResolvedValue("failed"),
      failedReason: "boom",
      returnvalue: null,
      progress: { percent: 0 },
    });

    const response = await GET({} as any, {
      params: Promise.resolve({ id: "2" }),
    });

    const payload = await readFirstSsePayload(response);
    expect(payload.type).toBe("error");
    expect(payload.message).toBe("boom");
  });
});

export {};
