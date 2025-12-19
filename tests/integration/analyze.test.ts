/**
 * Integration test for `/api/analyze` route.
 *
 * The route normally runs yt-dlp via child_process. For tests, we bypass that by
 * setting `process.env.YT_DLP_MOCK_JSON` (a test hook in the route) so tests are
 * stable and do not spawn external processes.
 *
 * IMPORTANT: `YT_DLP_MOCK_JSON` must be set BEFORE importing the route module,
 * because the module reads env vars at import time.
 */

process.env.YT_DLP_MOCK_JSON = JSON.stringify({
  title: "Mock Video",
  duration: "5:00",
  thumbnail: "thumb.jpg",
  formats: [
    { format_id: "18", ext: "mp4", format_note: "360p", filesize: 1024 },
  ],
});

jest.mock("ytpl", () => ({
  __esModule: true,
  default: jest.fn(),
}));

import { POST } from "@/app/api/analyze/route";

const ytpl = require("ytpl").default;

function createMockRequest(
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): any {
  return {
    json: async () => body,
    headers: {
      get: (name: string) => headers[name.toLowerCase()] || null,
    },
  };
}

describe("/api/analyze integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    ytpl.mockResolvedValue({
      title: "Mock Playlist",
      items: [
        {
          id: "abc",
          title: "Track A",
          duration: "3:00",
          bestThumbnail: { url: "thumb.jpg" },
        },
      ],
    });
  });

  it("returns metadata for a video URL", async () => {
    const request = createMockRequest({ url: "https://youtu.be/mock" });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.type).toBe("video");
    expect(data.title).toBe("Mock Video");
    expect(Array.isArray(data.formats)).toBe(true);
  });

  it("returns playlist metadata when list param is present", async () => {
    const request = createMockRequest({
      url: "https://www.youtube.com/playlist?list=MOCK",
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.type).toBe("playlist");
    expect(data.items).toHaveLength(1);
  });

  afterAll(() => {
    delete process.env.YT_DLP_MOCK_JSON;
  });
});
