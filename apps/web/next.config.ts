import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  // Internal workspace packages ship TypeScript source; Next compiles them.
  transpilePackages: ["@pemby/db", "@pemby/core", "@pemby/ai", "@pemby/ui"],
  experimental: {
    // `forbidden()` for the owner-only gate on product pages.
    authInterrupts: true,
  },
};

export default withNextIntl(nextConfig);
