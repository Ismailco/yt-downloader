import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';
import archiver from 'archiver';
import { downloadQueue } from '@/utils/queue';
import { verifyDownloadToken } from '@/utils/downloadToken';

const OUTPUT_BASE = process.env.OUTPUT_BASE || process.cwd();
const STORAGE_ROOT = path.join(OUTPUT_BASE, "storage");

function resolveJobDir(jobId: string): string {
  const baseDir = path.resolve(path.join(STORAGE_ROOT, jobId, "files"));
  return baseDir;
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
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  const url = new URL(request.url);
  const token = request.headers.get('x-download-token') || url.searchParams.get('token');

  try {
    const job = await ensureJobCompleted(jobId);

    // Get the job result to find the files
    const result = job.returnvalue as { files?: Array<{ name: string; path: string; url: string }> } | null;
    if (!result?.files || result.files.length === 0) {
      return new Response(JSON.stringify({ error: 'No files found for this job' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verify token for at least one file (they all share the same job)
    const firstFileName = result.files[0]?.name;
    if (firstFileName && !verifyDownloadToken(jobId, firstFileName, token)) {
      // Try without token verification for zip (token from any file works)
      const anyValidToken = result.files.some(f => verifyDownloadToken(jobId, f.name, token));
      if (!anyValidToken) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    const jobDir = resolveJobDir(jobId);

    // Verify all files exist
    const existingFiles: Array<{ name: string; fullPath: string }> = [];
    for (const file of result.files) {
      const fullPath = path.join(jobDir, path.basename(file.name));
      try {
        await fs.promises.access(fullPath, fs.constants.R_OK);
        existingFiles.push({ name: file.name, fullPath });
      } catch {
        console.warn(`[api/files/zip] File not found: ${fullPath}`);
      }
    }

    if (existingFiles.length === 0) {
      return new Response(JSON.stringify({ error: 'No files available for download' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Create a streaming zip archive
    const archive = archiver('zip', {
      zlib: { level: 5 } // Medium compression for balance of speed/size
    });

    // Add all files to the archive
    for (const file of existingFiles) {
      archive.file(file.fullPath, { name: file.name });
    }

    // Convert archiver stream to web ReadableStream
    const readable = new ReadableStream({
      start(controller) {
        archive.on('data', (chunk) => {
          controller.enqueue(chunk);
        });
        archive.on('end', () => {
          controller.close();
        });
        archive.on('error', (err) => {
          console.error('[api/files/zip] Archive error', err);
          controller.error(err);
        });

        // Finalize the archive (this triggers streaming)
        archive.finalize();
      },
      cancel() {
        archive.abort();
      }
    });

    const zipFileName = `playlist_${jobId}.zip`;

    return new Response(readable, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${zipFileName}"`,
        'Cache-Control': 'no-cache',
      }
    });

  } catch (error) {
    console.error("[api/files/zip] failed to create zip", error);
    const errorMessage = error instanceof Error ? error.message : '';
    const message =
      errorMessage === 'Job not found'
        ? 'Job not found'
        : errorMessage === 'Job not ready'
        ? 'Job not complete yet'
        : 'Unable to create zip file';
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
