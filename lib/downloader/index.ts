import path from "path";
import fs from "fs-extra";
import youtubedl from "youtube-dl-exec";
import ytpl from "ytpl";
import ffmpeg from "fluent-ffmpeg";
import {
  ProgressCallback,
  PlaylistProgressCallback,
  DownloadOptions,
  VideoResult,
  PlaylistResult,
} from "../../types";

type FetchPlaylistFn = (url: string) => Promise<unknown>;
const fetchPlaylist =
  (ytpl as unknown as { default?: FetchPlaylistFn }).default ||
  (ytpl as unknown as FetchPlaylistFn);

type YoutubeDlExecProcess = Promise<unknown> & {
  stdout?: NodeJS.ReadableStream;
  stderr?: NodeJS.ReadableStream;
};

function getYoutubeDlExec(): (
  url: string,
  options: Record<string, unknown>,
  spawnOptions: Record<string, unknown>,
) => YoutubeDlExecProcess {
  const mod = youtubedl as unknown as { exec?: unknown };
  if (typeof mod.exec !== "function") {
    throw new Error("youtube-dl exec function is not available");
  }
  return mod.exec as (
    url: string,
    options: Record<string, unknown>,
    spawnOptions: Record<string, unknown>,
  ) => YoutubeDlExecProcess;
}

async function convertToMp3(inputPath: string): Promise<string> {
  const directory = path.dirname(inputPath);
  const basename = path.basename(inputPath, path.extname(inputPath));
  const outputPath = path.join(directory, `${basename}.mp3`);

  await new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .noVideo()
      .audioCodec("libmp3lame")
      .audioBitrate(192)
      .format("mp3")
      .on("end", () => resolve())
      .on("error", (err: Error) => reject(err))
      .save(outputPath);
  });

  await fs.remove(inputPath).catch(() => {});
  return outputPath;
}

const VIDEO_FORMAT = "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best";
const AUDIO_FORMAT = "bestaudio[ext=m4a]/bestaudio/best";
const noop: ProgressCallback = () => {};

/**
 * Ensures a directory exists and throws a descriptive error if it cannot be created.
 * @param {string} targetDir
 */
async function ensureDirectory(targetDir: string): Promise<void> {
  try {
    await fs.ensureDir(targetDir);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(
      `Failed to prepare output directory "${targetDir}": ${message}`,
    );
  }
}

/**
 * Extracts a numeric percentage from youtube-dl progress output.
 * @param {string} chunk
 * @returns {number | null}
 */
function extractPercentage(chunk: string): number | null {
  const match = chunk.match(/(\d+(?:\.\d+)?)%/);
  return match ? parseFloat(match[1]) : null;
}

/**
 * Extracts the final file path from youtube-dl stdout.
 * @param {string} chunk
 * @returns {string | null}
 */
function extractFilePath(chunk: string): string | null {
  const destinationMatch = chunk.match(/Destination:\s(.+)/);
  if (destinationMatch) {
    return destinationMatch[1].trim().replace(/^"|"$/g, "");
  }

  const mergeMatch = chunk.match(/Merging formats into "(.+)"/);
  if (mergeMatch) {
    return mergeMatch[1].trim();
  }

  return null;
}

/**
 * Sanitizes names for filesystem usage.
 * @param {string} value
 */
function sanitizeName(value: string): string {
  return (
    (value || "untitled")
      .replace(/[^\w\s-]/gi, "")
      .replace(/\s+/g, "_")
      .trim() || "untitled"
  );
}

/**
 * Runs youtube-dl for a single URL and resolves with the final file path.
 */
async function executeDownload(
  videoUrl: string,
  outputTemplate: string,
  onProgress: ProgressCallback = noop,
  formatSelector: string = VIDEO_FORMAT,
): Promise<string> {
  let filePath: string | null = null;
  let lastPercent = 0;

  const download = getYoutubeDlExec()(
    videoUrl,
    {
      output: outputTemplate,
      format: formatSelector,
      progress: true,
    },
    { stdio: ["ignore", "pipe", "pipe"] },
  );

  if (download.stdout) {
    download.stdout.on("data", (data: Buffer) => {
      const chunk = data.toString();
      const percent = extractPercentage(chunk);
      const maybePath = extractFilePath(chunk);

      if (maybePath) {
        filePath = maybePath;
      }

      if (typeof percent === "number" && percent >= lastPercent) {
        lastPercent = percent;
        onProgress(percent, chunk.trim());
      }
    });
  }

  if (download.stderr) {
    download.stderr.on("data", (data: Buffer) => {
      const chunk = data.toString().trim();
      if (chunk) {
        onProgress(lastPercent, chunk);
      }
    });
  }

  try {
    await download;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`youtube-dl failed: ${message}`);
  }

  if (!filePath) {
    throw new Error(
      "Download completed but the output file path could not be determined.",
    );
  }

  return filePath;
}

/**
 * Downloads a single video.
 */
async function downloadVideo(
  videoUrl: string,
  outputDir: string,
  onProgress: ProgressCallback = noop,
  options: DownloadOptions = {},
): Promise<VideoResult> {
  if (!videoUrl) {
    throw new Error("Video URL is required.");
  }

  if (!outputDir) {
    throw new Error("An output directory is required.");
  }

  const resolvedDir = path.resolve(outputDir);
  const targetFormat = options.format === "mp3" ? "mp3" : "mp4";
  const formatSelector = targetFormat === "mp3" ? AUDIO_FORMAT : VIDEO_FORMAT;
  await ensureDirectory(resolvedDir);

  let started = false;
  const wrappedProgress: ProgressCallback = (percent, message) => {
    started = true;
    onProgress(Math.min(100, percent || 0), message || "Downloading video");
  };

  try {
    const downloadedPath = await executeDownload(
      videoUrl,
      path.join(resolvedDir, "%(title)s.%(ext)s"),
      wrappedProgress,
      formatSelector,
    );

    let finalPath = downloadedPath;
    if (targetFormat === "mp3") {
      finalPath = await convertToMp3(downloadedPath);
    }

    if (!started) {
      onProgress(100, "Download complete");
    }

    return { filePath: finalPath, format: targetFormat };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Failed to download video: ${message}`);
  }
}

/**
 * Downloads all videos in a playlist sequentially.
 */
async function downloadPlaylist(
  playlistUrl: string,
  outputDir: string,
  onProgress: PlaylistProgressCallback = () => {},
  options: DownloadOptions = {},
): Promise<PlaylistResult> {
  if (!playlistUrl) {
    throw new Error("Playlist URL is required.");
  }

  if (!outputDir) {
    throw new Error("An output directory is required.");
  }

  const resolvedDir = path.resolve(outputDir);
  const playlist = await fetchPlaylist(playlistUrl);

  const playlistData = playlist as unknown as {
    title?: string;
    items: Array<{ id: string; title?: string }>;
  };

  const targetFormat = options.format === "mp3" ? "mp3" : "mp4";
  const formatSelector = targetFormat === "mp3" ? AUDIO_FORMAT : VIDEO_FORMAT;

  const selectedIds =
    Array.isArray(options.selectedVideoIds) && options.selectedVideoIds.length
      ? new Set(options.selectedVideoIds)
      : null;

  const itemsToDownload = selectedIds
    ? playlistData.items.filter((item) => selectedIds.has(item.id))
    : playlistData.items;

  if (!itemsToDownload.length) {
    throw new Error("No matching videos found in playlist.");
  }

  const folderName = sanitizeName(playlistData.title || "playlist");
  const playlistDir = path.join(resolvedDir, folderName);
  await ensureDirectory(playlistDir);

  const files: string[] = [];
  const totalVideos = itemsToDownload.length;

  for (let i = 0; i < itemsToDownload.length; i += 1) {
    const item = itemsToDownload[i];
    const sanitizedTitle = sanitizeName(item.title || `video_${i + 1}`);
    const outputTemplate = path.join(playlistDir, `${sanitizedTitle}.%(ext)s`);

    const playlistProgress: ProgressCallback = (percent, message) => {
      onProgress({
        videoIndex: i,
        percent: Math.min(100, percent || 0),
        totalVideos,
        videoId: item.id,
        message:
          message ||
          `Downloading "${sanitizedTitle}" (${i + 1}/${totalVideos})`,
      });
    };

    try {
      const downloadedPath = await executeDownload(
        `https://www.youtube.com/watch?v=${item.id}`,
        outputTemplate,
        playlistProgress,
        formatSelector,
      );
      const finalPath =
        targetFormat === "mp3"
          ? await convertToMp3(downloadedPath)
          : downloadedPath;
      files.push(finalPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(
        `Failed to download "${item.title || item.id}": ${message}`,
      );
    }
  }

  return { folderPath: playlistDir, files };
}

export { downloadVideo, downloadPlaylist };
