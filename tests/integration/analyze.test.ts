jest.mock('youtube-dl-exec', () => ({
  __esModule: true,
  default: jest.fn(),
  exec: jest.fn()
}));

jest.mock('ytpl', () => ({
  __esModule: true,
  default: jest.fn()
}));

import { POST } from '@/app/api/analyze/route';

const youtubedl = require('youtube-dl-exec');
const ytpl = require('ytpl').default;

function createMockRequest(body: Record<string, unknown>, headers: Record<string, string> = {}): any {
  return {
    json: async () => body,
    headers: {
      get: (name: string) => headers[name.toLowerCase()] || null
    }
  };
}

describe('/api/analyze integration', () => {
  beforeEach(() => {
    process.env.API_KEY = 'test-key';
    jest.clearAllMocks();
    ytpl.mockResolvedValue({
      title: 'Mock Playlist',
      items: [
        { id: 'abc', title: 'Track A', duration: '3:00', bestThumbnail: { url: 'thumb.jpg' } }
      ]
    });
    youtubedl.default.mockResolvedValue({
      title: 'Mock Video',
      duration: '5:00',
      thumbnail: 'thumb.jpg',
      formats: [{ format_id: '18', ext: 'mp4', format_note: '360p', filesize: 1024 }]
    });
  });

  it('returns metadata for a video URL', async () => {
    const request = createMockRequest(
      { url: 'https://youtu.be/mock' },
      { 'x-api-key': 'test-key' }
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.type).toBe('video');
    expect(data.title).toBe('Mock Video');
    expect(Array.isArray(data.formats)).toBe(true);
  });

  it('returns playlist metadata when list param is present', async () => {
    const request = createMockRequest(
      { url: 'https://www.youtube.com/playlist?list=MOCK' },
      { 'x-api-key': 'test-key' }
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.type).toBe('playlist');
    expect(data.items).toHaveLength(1);
  });
});
