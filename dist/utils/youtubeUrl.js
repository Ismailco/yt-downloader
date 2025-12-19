"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAllowedYouTubeUrl = isAllowedYouTubeUrl;
function isAllowedYouTubeUrl(value) {
    try {
        const parsed = new URL(value);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return false;
        }
        const host = parsed.hostname.toLowerCase();
        if (host === 'youtu.be')
            return true;
        if (host === 'youtube.com')
            return true;
        if (host.endsWith('.youtube.com'))
            return true;
        return false;
    }
    catch {
        return false;
    }
}
