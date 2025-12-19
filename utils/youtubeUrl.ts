export function isAllowedYouTubeUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    if (host === 'youtu.be') return true;
    if (host === 'youtube.com') return true;
    if (host.endsWith('.youtube.com')) return true;
    return false;
  } catch {
    return false;
  }
}
