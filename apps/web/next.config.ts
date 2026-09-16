import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Internal workspace packages ship TypeScript source; Next compiles them.
  transpilePackages: ["@pemby/db", "@pemby/core", "@pemby/ai"],
};

export default nextConfig;
