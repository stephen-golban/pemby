import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { SITE_URL } from "@/i18n/page-metadata";
import { appEnv } from "@/lib/env";

// Rendered per request: APP_ENV is read at runtime, so a build never bakes in the wrong answer.
export default async function robots(): Promise<MetadataRoute.Robots> {
  await connection();
  if (appEnv() !== "production") {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/app", "/api/", "/sign-in", "/sign-up", "/access-denied"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
