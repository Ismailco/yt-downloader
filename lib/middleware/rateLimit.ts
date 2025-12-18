import limit from 'simple-rate-limiter';

interface RateLimitRecord {
  count: number;
  start: number;
}

interface RateLimitOptions {
  windowMs?: number;
  max?: number;
  keyGenerator?: (req: any) => string;
}

const rateLimitMaps = new Map<string, Map<string, RateLimitRecord>>();

function getOrCreateMap(name: string): Map<string, RateLimitRecord> {
  if (!rateLimitMaps.has(name)) {
    rateLimitMaps.set(name, new Map());
  }
  return rateLimitMaps.get(name)!;
}

export function createRateLimiter(name: string, options: RateLimitOptions = {}) {
  const windowMs = options.windowMs ?? 60 * 1000;
  const max = options.max ?? 20;
  const keyGenerator = options.keyGenerator ?? ((req: any) =>
    req.headers?.['x-forwarded-for'] || req.ip || 'unknown'
  );

  return function checkRateLimit(req: any): { allowed: boolean; remaining: number } {
    const map = getOrCreateMap(name);
    const key = keyGenerator(req);
    const now = Date.now();
    const record = map.get(key) || { count: 0, start: now };

    if (now - record.start > windowMs) {
      map.set(key, { count: 1, start: now });
      return { allowed: true, remaining: max - 1 };
    }

    if (record.count >= max) {
      return { allowed: false, remaining: 0 };
    }

    record.count++;
    map.set(key, record);
    return { allowed: true, remaining: max - record.count };
  };
}

export { limit };
