import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["ytpl", "youtube-dl-exec", "fluent-ffmpeg"],

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "i.ytimg.com",
      },
    ],
  },

  turbopack: {},

  // Enable hot reload for all environments
  webpack: (config, { dev, isServer }) => {
    if (dev && !isServer) {
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
      };
    }
    return config;
  },
};

export default nextConfig;
