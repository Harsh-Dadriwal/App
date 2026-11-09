import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a production build run beside `next dev` without overwriting its cache.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  compress: true,
  transpilePackages: ["@mahalaxmi/core"]
};

export default nextConfig;
