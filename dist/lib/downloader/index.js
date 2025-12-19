"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadVideo = downloadVideo;
exports.downloadPlaylist = downloadPlaylist;
const path_1 = __importDefault(require("path"));
const fs_extra_1 = __importDefault(require("fs-extra"));
const youtube_dl_exec_1 = __importDefault(require("youtube-dl-exec"));
const ytpl_1 = __importDefault(require("ytpl"));
const fluent_ffmpeg_1 = __importDefault(require("fluent-ffmpeg"));
const fetchPlaylist = ytpl_1.default.default ||
    ytpl_1.default;
function getYoutubeDlExec() {
    const mod = youtube_dl_exec_1.default;
    if (typeof mod.exec !== "function") {
        throw new Error("youtube-dl exec function is not available");
    }
    return mod.exec;
}
async function convertToMp3(inputPath) {
    const directory = path_1.default.dirname(inputPath);
    const basename = path_1.default.basename(inputPath, path_1.default.extname(inputPath));
    const outputPath = path_1.default.join(directory, `${basename}.mp3`);
    await new Promise((resolve, reject) => {
        (0, fluent_ffmpeg_1.default)(inputPath)
            .noVideo()
            .audioCodec("libmp3lame")
            .audioBitrate(192)
            .format("mp3")
            .on("end", () => resolve())
            .on("error", (err) => reject(err))
            .save(outputPath);
    });
    await fs_extra_1.default.remove(inputPath).catch(() => { });
    return outputPath;
}
const VIDEO_FORMAT = "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best";
const AUDIO_FORMAT = "bestaudio[ext=m4a]/bestaudio/best";
const noop = () => { };
async function ensureDirectory(targetDir) {
    try {
        await fs_extra_1.default.ensureDir(targetDir);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        throw new Error(`Failed to prepare output directory "${targetDir}": ${message}`);
    }
}
function extractPercentage(chunk) {
    const match = chunk.match(/(\d+(?:\.\d+)?)%/);
    return match ? parseFloat(match[1]) : null;
}
function extractFilePath(chunk) {
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
function sanitizeName(value) {
    return ((value || "untitled")
        .replace(/[^\w\s-]/gi, "")
        .replace(/\s+/g, "_")
        .trim() || "untitled");
}
async function executeDownload(videoUrl, outputTemplate, onProgress = noop, formatSelector = VIDEO_FORMAT) {
    let filePath = null;
    let lastPercent = 0;
    const download = getYoutubeDlExec()(videoUrl, {
        output: outputTemplate,
        format: formatSelector,
        progress: true,
    }, { stdio: ["ignore", "pipe", "pipe"] });
    if (download.stdout) {
        download.stdout.on("data", (data) => {
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
        download.stderr.on("data", (data) => {
            const chunk = data.toString().trim();
            if (chunk) {
                onProgress(lastPercent, chunk);
            }
        });
    }
    try {
        await download;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        throw new Error(`youtube-dl failed: ${message}`);
    }
    if (!filePath) {
        throw new Error("Download completed but the output file path could not be determined.");
    }
    return filePath;
}
async function downloadVideo(videoUrl, outputDir, onProgress = noop, options = {}) {
    if (!videoUrl) {
        throw new Error("Video URL is required.");
    }
    if (!outputDir) {
        throw new Error("An output directory is required.");
    }
    const resolvedDir = path_1.default.resolve(outputDir);
    const targetFormat = options.format === "mp3" ? "mp3" : "mp4";
    const formatSelector = targetFormat === "mp3" ? AUDIO_FORMAT : VIDEO_FORMAT;
    await ensureDirectory(resolvedDir);
    let started = false;
    const wrappedProgress = (percent, message) => {
        started = true;
        onProgress(Math.min(100, percent || 0), message || "Downloading video");
    };
    try {
        const downloadedPath = await executeDownload(videoUrl, path_1.default.join(resolvedDir, "%(title)s.%(ext)s"), wrappedProgress, formatSelector);
        let finalPath = downloadedPath;
        if (targetFormat === "mp3") {
            finalPath = await convertToMp3(downloadedPath);
        }
        if (!started) {
            onProgress(100, "Download complete");
        }
        return { filePath: finalPath, format: targetFormat };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        throw new Error(`Failed to download video: ${message}`);
    }
}
async function downloadPlaylist(playlistUrl, outputDir, onProgress = () => { }, options = {}) {
    if (!playlistUrl) {
        throw new Error("Playlist URL is required.");
    }
    if (!outputDir) {
        throw new Error("An output directory is required.");
    }
    const resolvedDir = path_1.default.resolve(outputDir);
    const playlist = await fetchPlaylist(playlistUrl);
    const playlistData = playlist;
    const targetFormat = options.format === "mp3" ? "mp3" : "mp4";
    const formatSelector = targetFormat === "mp3" ? AUDIO_FORMAT : VIDEO_FORMAT;
    const selectedIds = Array.isArray(options.selectedVideoIds) && options.selectedVideoIds.length
        ? new Set(options.selectedVideoIds)
        : null;
    const itemsToDownload = selectedIds
        ? playlistData.items.filter((item) => selectedIds.has(item.id))
        : playlistData.items;
    if (!itemsToDownload.length) {
        throw new Error("No matching videos found in playlist.");
    }
    const folderName = sanitizeName(playlistData.title || "playlist");
    const playlistDir = path_1.default.join(resolvedDir, folderName);
    await ensureDirectory(playlistDir);
    const files = [];
    const totalVideos = itemsToDownload.length;
    for (let i = 0; i < itemsToDownload.length; i += 1) {
        const item = itemsToDownload[i];
        const sanitizedTitle = sanitizeName(item.title || `video_${i + 1}`);
        const outputTemplate = path_1.default.join(playlistDir, `${sanitizedTitle}.%(ext)s`);
        const playlistProgress = (percent, message) => {
            onProgress({
                videoIndex: i,
                percent: Math.min(100, percent || 0),
                totalVideos,
                videoId: item.id,
                message: message ||
                    `Downloading "${sanitizedTitle}" (${i + 1}/${totalVideos})`,
            });
        };
        try {
            const downloadedPath = await executeDownload(`https://www.youtube.com/watch?v=${item.id}`, outputTemplate, playlistProgress, formatSelector);
            const finalPath = targetFormat === "mp3"
                ? await convertToMp3(downloadedPath)
                : downloadedPath;
            files.push(finalPath);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            throw new Error(`Failed to download "${item.title || item.id}": ${message}`);
        }
    }
    return { folderPath: playlistDir, files };
}
