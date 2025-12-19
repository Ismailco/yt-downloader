"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signDownloadToken = signDownloadToken;
exports.verifyDownloadToken = verifyDownloadToken;
const crypto_1 = __importDefault(require("crypto"));
function getTokenSecret() {
    const secret = process.env.DOWNLOAD_TOKEN_SECRET;
    if (!secret) {
        throw new Error('DOWNLOAD_TOKEN_SECRET is required');
    }
    return secret;
}
function getDefaultTtlSeconds() {
    const raw = process.env.DOWNLOAD_TOKEN_TTL_SECONDS;
    const parsed = raw ? Number(raw) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
    }
    return 60 * 60;
}
function signDownloadToken(jobId, fileName, expiresAtMs = Date.now() + getDefaultTtlSeconds() * 1000) {
    const payload = `${String(jobId)}:${fileName}:${String(expiresAtMs)}`;
    const signature = crypto_1.default
        .createHmac('sha256', getTokenSecret())
        .update(payload)
        .digest('hex');
    return `v1.${expiresAtMs}.${signature}`;
}
function verifyDownloadToken(jobId, fileName, token) {
    if (!token)
        return false;
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
    const expected = crypto_1.default
        .createHmac('sha256', getTokenSecret())
        .update(payload)
        .digest('hex');
    try {
        return crypto_1.default.timingSafeEqual(Buffer.from(expected), Buffer.from(parts[2]));
    }
    catch {
        return false;
    }
}
