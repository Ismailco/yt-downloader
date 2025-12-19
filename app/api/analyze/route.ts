import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ytpl from "ytpl";

import { createPubSubClient } from "@/utils/queue";
import { isAllowedYouTubeUrl } from "@/utils/youtubeUrl";

const execFileAsync = promisify(execFile);

// Allow tests (and deployments) to override the yt-dlp binary location.
// Defaults to the container-installed location.
const YT_DLP_BIN = process.env.YT_DLP_BIN || "/usr/local/bin/yt-dlp";

// For tests: if this env var is set, we bypass spawning yt-dlp and return this JSON instead.
// This avoids brittle child_process mocking and prevents hanging tests.
const YT_DLP_MOCK_JSON = process.env.YT_DLP_MOCK_JSON || "";

type FetchPlaylistFn = (
  url: string,
  options?: { limit?: number },
) => Promise<unknown>;
const fetchPlaylist =
  (ytpl as unknown as { default?: FetchPlaylistFn }).default ||
  (ytpl as unknown as FetchPlaylistFn);

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
  type: "video";
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
  type: "playlist";
  title: string;
  items: PlaylistItem[];
}

interface YoutubeDlFormat {
  format_id?: string;
  ext?: string;
  format_note?: string;
  filesize?: number;
}

interface YoutubeDlInfo {
  title?: string;
  duration?: string | number;
  duration_string?: string;
  thumbnail?: string;
  formats?: YoutubeDlFormat[];
}

interface YtplThumbnail {
  url?: string;
}

interface YtplAuthor {
  name?: string;
}

interface YtplItem {
  id: string;
  title: string;
  duration?: string;
  bestThumbnail?: YtplThumbnail;
  thumbnails?: YtplThumbnail[];
  author?: YtplAuthor;
}

interface YtplPlaylist {
  title: string;
  items: YtplItem[];
}

const rateLimitMap = new Map<string, RateLimitRecord>();
const RATE_LIMIT_WINDOW = 30 * 1000;
const RATE_LIMIT_MAX = 10;

const shouldUseRedisRateLimit = !!(
  process.env.REDIS_URL ||
  process.env.REDIS_HOST ||
  process.env.REDIS_PORT
);

const rateLimitClient = shouldUseRedisRateLimit ? createPubSubClient() : null;
let rateLimitClientReady = false;
let rateLimitClientConnecting: Promise<void> | null = null;
rateLimitClient?.on("error", () => {
  rateLimitClientReady = false;
  rateLimitClientConnecting = null;
});

async function ensureRateLimitClientReady(): Promise<void> {
  if (!rateLimitClient || rateLimitClientReady) {
    return;
  }

  if (!rateLimitClientConnecting) {
    rateLimitClientConnecting = rateLimitClient
      .connect()
      .then(() => {
        rateLimitClientReady = true;
      })
      .catch(() => {
        rateLimitClientReady = false;
      })
      .finally(() => {
        rateLimitClientConnecting = null;
      });
  }

  await rateLimitClientConnecting;
}

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

async function checkRateLimitRedis(ip: string): Promise<boolean> {
  if (!rateLimitClient) {
    return checkRateLimit(ip);
  }

  await ensureRateLimitClientReady();
  if (!rateLimitClientReady) {
    return checkRateLimit(ip);
  }

  const key = `ratelimit:analyze:${ip}`;
  try {
    const count = await rateLimitClient.incr(key);
    if (count === 1) {
      await rateLimitClient.pExpire(key, RATE_LIMIT_WINDOW);
    }
    return count <= RATE_LIMIT_MAX;
  } catch {
    return true;
  }
}

async function fetchVideoMetadata(url: string): Promise<VideoMetadata> {
  // Test hook: allow bypassing the external yt-dlp process entirely.
  // Provide a full JSON blob in `YT_DLP_MOCK_JSON`.
  if (YT_DLP_MOCK_JSON) {
    const info = JSON.parse(YT_DLP_MOCK_JSON) as YoutubeDlInfo;
    return {
      type: "video",
      title: info.title || "Untitled",
      duration: info.duration ?? info.duration_string ?? "",
      thumbnail: info.thumbnail || "",
      formats: info.formats?.map((format: YoutubeDlFormat) => ({
        format_id: format.format_id || "",
        ext: format.ext || "",
        format_note: format.format_note,
        filesize: format.filesize,
      })),
    };
  }

  // Run yt-dlp directly (youtube-dl-exec still tries to spawn its bundled binary path,
  // even when passing `bin`, which causes ENOENT in container builds).
  const args = [
    url,
    "--dump-single-json",
    "--no-check-certificates",
    "--no-warnings",
    "--prefer-free-formats",
    "--add-header",
    "referer:youtube.com",
    "--add-header",
    "user-agent:googlebot",
  ];

  const { stdout } = await execFileAsync(YT_DLP_BIN, args, {
    maxBuffer: 50 * 1024 * 1024,
  });

  const info = JSON.parse(stdout) as YoutubeDlInfo;

  return {
    type: "video",
    title: info.title || "Untitled",
    duration: info.duration ?? info.duration_string ?? "",
    thumbnail: info.thumbnail || "",
    formats: info.formats?.map((format: YoutubeDlFormat) => ({
      format_id: format.format_id || "",
      ext: format.ext || "",
      format_note: format.format_note,
      filesize: format.filesize,
    })),
  };
}

async function fetchPlaylistMetadata(url: string): Promise<PlaylistMetadata> {
  const playlist = (await fetchPlaylist(url, {
    limit: 50,
  })) as unknown as YtplPlaylist;
  return {
    type: "playlist",
    title: playlist.title || "Untitled playlist",
    items: playlist.items.map((item: YtplItem) => ({
      id: item.id,
      title: item.title,
      duration: item.duration,
      thumbnail: item.bestThumbnail?.url || item.thumbnails?.[0]?.url,
      author: item.author?.name,
    })),
  };
}

export async function POST(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip =
    (forwardedFor ? forwardedFor.split(",")[0]?.trim() : null) || "unknown";

  if (!(await checkRateLimitRedis(ip))) {
    return NextResponse.json(
      { error: "Too many analyze requests, please slow down." },
      { status: 429 },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { url } = body || {};
  if (!url || typeof url !== "string" || !/^https?:\/\//i.test(url)) {
    return NextResponse.json(
      { error: "A valid URL is required" },
      { status: 400 },
    );
  }

  if (!isAllowedYouTubeUrl(url)) {
    return NextResponse.json(
      { error: "Only YouTube URLs are supported" },
      { status: 400 },
    );
  }

  try {
    const payload = isPlaylistUrl(url)
      ? await fetchPlaylistMetadata(url)
      : await fetchVideoMetadata(url);

    return NextResponse.json({ url, ...payload });
  } catch (error) {
    console.error("[api/analyze] failed to analyze URL", error);
    return NextResponse.json(
      { error: "Unable to analyze URL. Please try again." },
      { status: 500 },
    );
  }
}
