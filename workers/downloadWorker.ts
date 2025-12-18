import path from 'path';
import fs from 'fs-extra';
import { Worker, Job } from 'bullmq';
import {
  connection,
  failedDownloadQueue,
  createPubSubClient
} from '../utils/queue';
import { signDownloadToken } from '../utils/downloadToken';
import { downloadVideo, downloadPlaylist } from '../lib/downloader';

const OUTPUT_BASE = process.env.OUTPUT_BASE || process.cwd();
const STORAGE_ROOT = path.join(OUTPUT_BASE, 'storage');
const TMP_ROOT = path.join(OUTPUT_BASE, 'tmp');
const CONCURRENCY = Number(process.env.CONCURRENCY || process.env.WORKER_CONCURRENCY || 2);
const PUBSUB_CHANNEL = process.env.DOWNLOAD_EVENTS_CHANNEL || 'download:events';

const publisher = createPubSubClient();
let publisherReady = false;
publisher.on('error', (err: Error) => {
  console.error('[worker] Redis pub/sub error', err);
});
publisher.connect().then(() => {
  publisherReady = true;
  console.log('[worker] Redis pub/sub connected');
});

const layout = {
  filesDir(jobId: string): string {
    return path.join(STORAGE_ROOT, String(jobId), 'files');
  },
  tempDir(jobId: string): string {
    return path.join(TMP_ROOT, String(jobId));
  }
};

async function publishEvent(type: string, payload: Record<string, unknown>): Promise<void> {
  if (!publisherReady) {
    return;
  }
  try {
    await publisher.publish(
      PUBSUB_CHANNEL,
      JSON.stringify({
        type,
        ...payload
      })
    );
  } catch (error) {
    console.error('[worker] Failed to publish event', error);
  }
}

async function trackProgress(job: Job, data: Record<string, unknown>): Promise<void> {
  await job.updateProgress(data);
  await publishEvent('progress', {
    jobId: job.id,
    progress: data
  });
}

async function prepareFileSystem(jobId: string): Promise<void> {
  await Promise.all([fs.ensureDir(layout.filesDir(jobId)), fs.ensureDir(layout.tempDir(jobId))]);
}

async function finalizeFiles(jobId: string, tempPaths: string[]): Promise<string[]> {
  const finalDir = layout.filesDir(jobId);
  const moved = [];
  for (const originalPath of tempPaths) {
    const name = path.basename(originalPath);
    const destination = path.join(finalDir, name);
    await fs.move(originalPath, destination, { overwrite: true });
    moved.push(destination);
  }
  return moved;
}

function buildFileMeta(jobId: string, files: string[]) {
  const token = signDownloadToken(jobId);
  return files.map((filePath: string) => {
    const name = path.basename(filePath);
    return {
      name,
      path: filePath,
      url: `/api/files/${jobId}/${encodeURIComponent(name)}?token=${token}`
    };
  });
}

async function processVideoJob(job: Job, tempDir: string) {
  const downloadOptions = {
    format: job.data.format || 'mp4',
    quality: job.data.quality || 'best'
  };
  const result = await downloadVideo(
    job.data.url,
    tempDir,
    (percent, message) => trackProgress(job, { percent, message }),
    downloadOptions
  );
  const movedFiles = await finalizeFiles(job.id!, [result.filePath]);
  await trackProgress(job, { percent: 100, message: 'Video download complete' });
  const filesMeta = buildFileMeta(job.id!, movedFiles);
  return {
    downloadUrl: filesMeta[0]?.url || null,
    files: filesMeta
  };
}

async function processPlaylistJob(job: Job, tempDir: string) {
  const { options = {} } = job.data;
  const result = await downloadPlaylist(
    job.data.url,
    tempDir,
    (progress) =>
      trackProgress(job, {
        percent: progress.percent,
        videoIndex: progress.videoIndex,
        totalVideos: progress.totalVideos,
        videoId: progress.videoId,
        message: progress.message
      }),
    options
  );
  const movedFiles = await finalizeFiles(job.id!, result.files);
  await trackProgress(job, { percent: 100, message: 'Playlist download complete' });
  const filesMeta = buildFileMeta(job.id!, movedFiles);
  return {
    downloadUrl: filesMeta[0]?.url || null,
    folderPath: layout.filesDir(job.id!),
    files: filesMeta
  };
}

async function processJob(job: Job) {
  await prepareFileSystem(job.id!);
  const tempDir = layout.tempDir(job.id!);
  try {
    let result;
    if (job.name === 'video') {
      result = await processVideoJob(job, tempDir);
    } else if (job.name === 'playlist') {
      result = await processPlaylistJob(job, tempDir);
    } else {
      throw new Error(`Unsupported job type: ${job.name}`);
    }

    await publishEvent('completed', { jobId: job.id, result });
    return result;
  } catch (error) {
    await publishEvent('error', { jobId: job.id, message: (error as Error).message });
    throw error;
  } finally {
    await fs.remove(tempDir).catch(() => {});
  }
}

function startWorker() {
  const worker = new Worker('download', processJob, {
    connection,
    concurrency: CONCURRENCY
  });

  worker.on('completed', (job) => {
    console.log(`[worker] Job ${job.id} completed`);
  });

  worker.on('failed', async (job, err) => {
    if (job) {
      console.error(`[worker] Job ${job.id} failed`, err);
      await failedDownloadQueue.add(
        'failed',
        {
          jobId: job.id,
          data: job.data,
          attemptsMade: job.attemptsMade,
          error: err.message
        },
        { removeOnComplete: true }
      );
      await publishEvent('error', { jobId: job.id, message: err.message });
    } else {
      console.error('[worker] Unknown job failed', err);
    }
  });

  worker.on('error', (err) => {
    console.error('[worker] Worker runtime error', err);
  });

  return worker;
}

export { startWorker };
