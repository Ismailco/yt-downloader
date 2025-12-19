import crypto from 'crypto';


function getTokenSecret(): string {
  const secret = process.env.DOWNLOAD_TOKEN_SECRET;
  if (!secret) {
    throw new Error('DOWNLOAD_TOKEN_SECRET is required');
  }
  return secret;
}

function getDefaultTtlSeconds(): number {
  const raw = process.env.DOWNLOAD_TOKEN_TTL_SECONDS;
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return 60 * 60;
}

export function signDownloadToken(
  jobId: string | number,
  fileName: string,
  expiresAtMs: number = Date.now() + getDefaultTtlSeconds() * 1000,
): string {
  const payload = `${String(jobId)}:${fileName}:${String(expiresAtMs)}`;
  const signature = crypto
    .createHmac('sha256', getTokenSecret())
    .update(payload)
    .digest('hex');
  return `v1.${expiresAtMs}.${signature}`;
}

export function verifyDownloadToken(
  jobId: string | number,
  fileName: string,
  token: string | null | undefined,
): boolean {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') {
    return false;
  }

  const expiresAtMs = Number(parts[1]);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= 0) {
    return false;
  }
  if (Date.now() > expiresAtMs) {
    return false;
  }

  const payload = `${String(jobId)}:${fileName}:${String(expiresAtMs)}`;
  const expected = crypto
    .createHmac('sha256', getTokenSecret())
    .update(payload)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts[2]));
  } catch {
    return false;
  }
}
