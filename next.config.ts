import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  compress: true,
  transpilePackages: ["@mahalaxmi/core"]
};

export default nextConfig;
