import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['ytpl', 'youtube-dl-exec', 'fluent-ffmpeg'],
};

export default nextConfig;
