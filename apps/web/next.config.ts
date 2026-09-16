import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  // Internal workspace packages ship TypeScript source; Next compiles them.
  transpilePackages: ["@pemby/db", "@pemby/core", "@pemby/ai", "@pemby/ui"],
  // Legal pages moved to top-level URLs (owner decision, phase 03). The old paths stay alive.
  redirects() {
    return Promise.resolve(
      (["terms", "privacy", "refunds"] as const).map((page) => ({
        source: `/legal/${page}`,
        destination: `/${page}`,
        permanent: true,
      })),
    );
  },
  experimental: {
    // `forbidden()` for the owner-only gate on product pages.
    authInterrupts: true,
  },
};

export default withNextIntl(nextConfig);
