#!/usr/bin/env node
import fs from 'fs-extra';
import path from 'path';
import { Stats } from 'fs';

const STORAGE_ROOT = path.join(process.cwd(), 'storage');
const TMP_ROOT = path.join(process.cwd(), 'tmp');
const TTL_HOURS = Number(process.env.STORAGE_TTL_HOURS || process.env.STORAGE_TTL || 24);

function isExpired(stats: Stats, ttlMs: number): boolean {
  const now = Date.now();
  const updatedAt = stats.mtimeMs || stats.ctimeMs || stats.birthtimeMs;
  return now - updatedAt > ttlMs;
}

async function cleanupDirectory(root: string, ttlMs: number, label: string): Promise<void> {
  if (!await fs.pathExists(root)) {
    return;
  }

  const entries = await fs.readdir(root);
  for (const entry of entries) {
    const targetPath = path.join(root, entry);
    try {
      const stats = await fs.stat(targetPath);
      if (isExpired(stats, ttlMs)) {
        await fs.remove(targetPath);
        console.log(`[cleanup] Removed expired ${label}: ${targetPath}`);
      }
    } catch (error) {
      console.error(`[cleanup] Failed to inspect ${targetPath}`, error);
    }
  }
}

async function run(): Promise<void> {
  const ttlMs = TTL_HOURS * 60 * 60 * 1000;
  console.log(`[cleanup] Starting cleanup with TTL ${TTL_HOURS}h (${ttlMs} ms)`);
  await cleanupDirectory(STORAGE_ROOT, ttlMs, 'storage');
  await cleanupDirectory(TMP_ROOT, ttlMs, 'tmp');
  console.log('[cleanup] Completed');
}

run().catch((error) => {
  console.error('[cleanup] Fatal error', error);
  process.exitCode = 1;
});
