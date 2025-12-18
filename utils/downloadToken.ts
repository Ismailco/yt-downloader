import crypto from 'crypto';

const TOKEN_SECRET = process.env.DOWNLOAD_TOKEN_SECRET || process.env.API_KEY || 'fallback-secret';

export function signDownloadToken(jobId: string | number): string {
  return crypto.createHmac('sha256', TOKEN_SECRET).update(String(jobId)).digest('hex');
}

export function verifyDownloadToken(jobId: string | number, token: string | null | undefined): boolean {
  if (!token) return false;
  const expected = signDownloadToken(jobId);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
  } catch {
    return false;
  }
}
