import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';
import { downloadQueue } from '@/utils/queue';
import { verifyDownloadToken } from '@/utils/downloadToken';

const OUTPUT_BASE = process.env.OUTPUT_BASE || process.cwd();
const STORAGE_ROOT = path.join(OUTPUT_BASE, "storage");

function resolveFilePath(jobId: string, file: string): string {
  const safeName = path.basename(file).replace(/\.\.+/g, "");
  const baseDir = path.resolve(path.join(STORAGE_ROOT, jobId, "files"));
  const target = path.resolve(path.join(baseDir, safeName));
  if (target !== baseDir && !target.startsWith(`${baseDir}${path.sep}`)) {
    throw new Error("Invalid file path");
  }
  return target;
}

async function ensureJobCompleted(jobId: string) {
  const job = await downloadQueue.getJob(jobId);
  if (!job) {
    throw new Error('Job not found');
  }
  const state = await job.getState();
  if (state !== 'completed') {
    throw new Error('Job not ready');
  }
  return job;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string; file: string }> },
) {
  const { jobId, file } = await params;
  const fileName = path.basename(file);
  const url = new URL(request.url);
  const token = request.headers.get('x-download-token') || url.searchParams.get('token');

  try {
    await ensureJobCompleted(jobId);
    if (!verifyDownloadToken(jobId, fileName, token)) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const filePath = resolveFilePath(jobId, fileName);
    const stat = await fs.promises.stat(filePath);
    const rangeHeader = request.headers.get("range");

    let start: number | undefined;
    let end: number | undefined;
    let status = 200;
    const headers: Record<string, string> = {
      "Content-Disposition": `attachment; filename="${encodeURIComponent(path.basename(filePath))}"`,
      "Accept-Ranges": "bytes",
      "Content-Type": "application/octet-stream",
    };

    if (rangeHeader) {
      const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
      if (match) {
        start = match[1] ? parseInt(match[1], 10) : 0;
        end = match[2] ? parseInt(match[2], 10) : stat.size - 1;

        if (start >= stat.size || end >= stat.size || start > end) {
          return new Response(null, {
            status: 416,
            headers: { "Content-Range": `bytes */${stat.size}` },
          });
        }

        status = 206;
        headers["Content-Range"] = `bytes ${start}-${end}/${stat.size}`;
        headers["Content-Length"] = String(end - start + 1);
      }
    } else {
      headers["Content-Length"] = String(stat.size);
    }

    const fileStream = fs.createReadStream(filePath, start !== undefined ? { start, end } : undefined);

    const readableStream = new ReadableStream({
      start(controller) {
        fileStream.on("data", (chunk) => {
          controller.enqueue(chunk);
        });
        fileStream.on("end", () => {
          controller.close();
        });
        fileStream.on("error", (err) => {
          console.error("[api/files] stream error", err);
          controller.error(err);
        });
      },
      cancel() {
        fileStream.destroy();
      },
    });

    return new Response(readableStream, { status, headers });
  } catch (error) {
    console.error("[api/files] failed to serve file", error);
    const errorMessage = error instanceof Error ? error.message : '';
    const message =
      errorMessage === 'Job not found'
        ? 'Job not found'
        : errorMessage === 'Job not ready'
        ? 'Job not complete yet'
        : 'Unable to serve file';
    const status =
      errorMessage === 'Job not found'
        ? 404
        : errorMessage === 'Job not ready'
        ? 409
        : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
}
