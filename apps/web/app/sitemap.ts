import type { MetadataRoute } from "next";
import { PUBLIC_PATHS, SITE_URL } from "@/i18n/page-metadata";

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((path) => ({ url: new URL(path, SITE_URL).href }));
}
