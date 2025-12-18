import { NextRequest, NextResponse } from 'next/server';
import youtubedl from 'youtube-dl-exec';
import ytpl from 'ytpl';

const fetchPlaylist = (ytpl as any).default || ytpl;

interface RateLimitRecord {
  count: number;
  start: number;
}

interface VideoFormat {
  format_id: string;
  ext: string;
  format_note?: string;
  filesize?: number;
}

interface VideoMetadata {
  type: 'video';
  title: string;
  duration: string | number;
  thumbnail: string;
  formats?: VideoFormat[];
}

interface PlaylistItem {
  id: string;
  title: string;
  duration?: string;
  thumbnail?: string;
  author?: string;
}

interface PlaylistMetadata {
  type: 'playlist';
  title: string;
  items: PlaylistItem[];
}

const rateLimitMap = new Map<string, RateLimitRecord>();
const RATE_LIMIT_WINDOW = 30 * 1000;
const RATE_LIMIT_MAX = 10;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip) || { count: 0, start: now };

  if (now - record.start > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(ip, { count: 1, start: now });
    return true;
  }

  if (record.count >= RATE_LIMIT_MAX) {
    return false;
  }

  record.count++;
  rateLimitMap.set(ip, record);
  return true;
}

function isPlaylistUrl(url: string): boolean {
  return /[?&]list=/.test(url);
}

function validateApiKey(request: NextRequest): boolean {
  const apiKey = request.headers.get('x-api-key');
  return !!(process.env.API_KEY && apiKey === process.env.API_KEY);
}

async function fetchVideoMetadata(url: string): Promise<VideoMetadata> {
  const info: any = await youtubedl(url, {
    dumpSingleJson: true,
    noCheckCertificates: true,
    noWarnings: true,
    preferFreeFormats: true,
    addHeader: ['referer:youtube.com', 'user-agent:googlebot']
  });

  return {
    type: 'video',
    title: info.title,
    duration: info.duration || info.duration_string,
    thumbnail: info.thumbnail,
    formats: info.formats?.map((format: any) => ({
      format_id: format.format_id,
      ext: format.ext,
      format_note: format.format_note,
      filesize: format.filesize
    }))
  };
}

async function fetchPlaylistMetadata(url: string): Promise<PlaylistMetadata> {
  const playlist = await fetchPlaylist(url, { limit: 50 });
  return {
    type: 'playlist',
    title: playlist.title,
    items: playlist.items.map((item: any) => ({
      id: item.id,
      title: item.title,
      duration: item.duration,
      thumbnail: item.bestThumbnail?.url || item.thumbnails?.[0]?.url,
      author: item.author?.name
    }))
  };
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';

  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: 'Too many analyze requests, please slow down.' },
      { status: 429 }
    );
  }

  if (!validateApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { url } = body || {};
  if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: 'A valid URL is required' }, { status: 400 });
  }

  try {
    const payload = isPlaylistUrl(url)
      ? await fetchPlaylistMetadata(url)
      : await fetchVideoMetadata(url);

    return NextResponse.json({ url, ...payload });
  } catch (error) {
    console.error('[api/analyze] failed to analyze URL', error);
    return NextResponse.json(
      { error: 'Unable to analyze URL. Please try again.' },
      { status: 500 }
    );
  }
}
