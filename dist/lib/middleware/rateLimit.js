"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.limit = void 0;
exports.createRateLimiter = createRateLimiter;
const simple_rate_limiter_1 = __importDefault(require("simple-rate-limiter"));
exports.limit = simple_rate_limiter_1.default;
const rateLimitMaps = new Map();
function getOrCreateMap(name) {
    if (!rateLimitMaps.has(name)) {
        rateLimitMaps.set(name, new Map());
    }
    return rateLimitMaps.get(name);
}
function createRateLimiter(name, options = {}) {
    const windowMs = options.windowMs ?? 60 * 1000;
    const max = options.max ?? 20;
    const keyGenerator = options.keyGenerator ??
        ((req) => {
            const forwardedFor = req.headers?.['x-forwarded-for'];
            if (Array.isArray(forwardedFor)) {
                return forwardedFor[0] || req.ip || 'unknown';
            }
            return forwardedFor || req.ip || 'unknown';
        });
    return function checkRateLimit(req) {
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
