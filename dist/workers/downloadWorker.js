"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startWorker = startWorker;
const path_1 = __importDefault(require("path"));
const fs_extra_1 = __importDefault(require("fs-extra"));
const bullmq_1 = require("bullmq");
const queue_1 = require("../utils/queue");
const downloadToken_1 = require("../utils/downloadToken");
const downloader_1 = require("../lib/downloader");
const OUTPUT_BASE = process.env.OUTPUT_BASE || process.cwd();
const STORAGE_ROOT = path_1.default.join(OUTPUT_BASE, "storage");
const TMP_ROOT = path_1.default.join(OUTPUT_BASE, "tmp");
const CONCURRENCY = Number(process.env.CONCURRENCY || process.env.WORKER_CONCURRENCY || 2);
const PUBSUB_CHANNEL = process.env.DOWNLOAD_EVENTS_CHANNEL || "download:events";
const publisher = (0, queue_1.createPubSubClient)();
let publisherReady = false;
publisher.on("error", (err) => {
    console.error("[worker] Redis pub/sub error", err);
});
publisher.connect().then(() => {
    publisherReady = true;
    console.log("[worker] Redis pub/sub connected");
});
const layout = {
    filesDir(jobId) {
        return path_1.default.join(STORAGE_ROOT, String(jobId), "files");
    },
    tempDir(jobId) {
        return path_1.default.join(TMP_ROOT, String(jobId));
    },
};
async function publishEvent(type, payload) {
    if (!publisherReady) {
        return;
    }
    try {
        await publisher.publish(PUBSUB_CHANNEL, JSON.stringify({
            type,
            ...payload,
        }));
    }
    catch (error) {
        console.error("[worker] Failed to publish event", error);
    }
}
async function trackProgress(job, data) {
    await job.updateProgress(data);
    await publishEvent("progress", {
        jobId: job.id,
        progress: data,
    });
}
async function prepareFileSystem(jobId) {
    await Promise.all([
        fs_extra_1.default.ensureDir(layout.filesDir(jobId)),
        fs_extra_1.default.ensureDir(layout.tempDir(jobId)),
    ]);
}
async function finalizeFiles(jobId, tempPaths) {
    const finalDir = layout.filesDir(jobId);
    const moved = [];
    for (const originalPath of tempPaths) {
        const name = path_1.default.basename(originalPath);
        const destination = path_1.default.join(finalDir, name);
        await fs_extra_1.default.move(originalPath, destination, { overwrite: true });
        moved.push(destination);
    }
    return moved;
}
function buildFileMeta(jobId, files) {
    return files.map((filePath) => {
        const name = path_1.default.basename(filePath);
        const token = encodeURIComponent((0, downloadToken_1.signDownloadToken)(jobId, name));
        return {
            name,
            path: filePath,
            url: `/api/files/${jobId}/${encodeURIComponent(name)}?token=${token}`,
        };
    });
}
async function processVideoJob(job, tempDir) {
    const downloadOptions = {
        format: job.data.format || "mp4",
        quality: job.data.quality || "best",
    };
    const result = await (0, downloader_1.downloadVideo)(job.data.url, tempDir, (percent, message) => trackProgress(job, { percent, message }), downloadOptions);
    const movedFiles = await finalizeFiles(job.id, [result.filePath]);
    await trackProgress(job, {
        percent: 100,
        message: "Video download complete",
    });
    const filesMeta = buildFileMeta(job.id, movedFiles);
    return {
        downloadUrl: filesMeta[0]?.url || null,
        files: filesMeta,
    };
}
async function processPlaylistJob(job, tempDir) {
    const { options = {} } = job.data;
    const result = await (0, downloader_1.downloadPlaylist)(job.data.url, tempDir, (progress) => trackProgress(job, {
        percent: progress.percent,
        videoIndex: progress.videoIndex,
        totalVideos: progress.totalVideos,
        videoId: progress.videoId,
        message: progress.message,
    }), options);
    const movedFiles = await finalizeFiles(job.id, result.files);
    await trackProgress(job, {
        percent: 100,
        message: "Playlist download complete",
    });
    const filesMeta = buildFileMeta(job.id, movedFiles);
    return {
        downloadUrl: filesMeta[0]?.url || null,
        folderPath: layout.filesDir(job.id),
        files: filesMeta,
    };
}
async function processJob(job) {
    await prepareFileSystem(job.id);
    const tempDir = layout.tempDir(job.id);
    try {
        let result;
        if (job.name === "video") {
            result = await processVideoJob(job, tempDir);
        }
        else if (job.name === "playlist") {
            result = await processPlaylistJob(job, tempDir);
        }
        else {
            throw new Error(`Unsupported job type: ${job.name}`);
        }
        await publishEvent("completed", { jobId: job.id, result });
        return result;
    }
    catch (error) {
        await publishEvent("error", {
            jobId: job.id,
            message: error.message,
        });
        throw error;
    }
    finally {
        await fs_extra_1.default.remove(tempDir).catch(() => { });
    }
}
function startWorker() {
    const worker = new bullmq_1.Worker("download", processJob, {
        connection: (0, queue_1.getConnection)(),
        concurrency: CONCURRENCY,
    });
    worker.on("completed", (job) => {
        console.log(`[worker] Job ${job.id} completed`);
    });
    worker.on("failed", async (job, err) => {
        if (job) {
            console.error(`[worker] Job ${job.id} failed`, err);
            await queue_1.failedDownloadQueue.add("failed", {
                jobId: job.id,
                data: job.data,
                attemptsMade: job.attemptsMade,
                error: err.message,
            }, { removeOnComplete: true });
            await publishEvent("error", { jobId: job.id, message: err.message });
        }
        else {
            console.error("[worker] Unknown job failed", err);
        }
    });
    worker.on("error", (err) => {
        console.error("[worker] Worker runtime error", err);
    });
    return worker;
}
if (require.main === module) {
    console.log("[worker] Starting download worker...");
    const worker = startWorker();
    process.on("SIGTERM", async () => {
        console.log("[worker] Received SIGTERM, shutting down gracefully...");
        await worker.close();
        await publisher.quit();
        process.exit(0);
    });
    process.on("SIGINT", async () => {
        console.log("[worker] Received SIGINT, shutting down gracefully...");
        await worker.close();
        await publisher.quit();
        process.exit(0);
    });
    console.log(`[worker] Worker started with concurrency: ${CONCURRENCY}`);
}
