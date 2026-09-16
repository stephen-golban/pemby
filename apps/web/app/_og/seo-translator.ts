import { createTranslator } from "next-intl";
import seo from "@/messages/en/seo.json";

// Metadata image routes build outside a page render, so they read the Seo namespace directly.
// English only for now (PLAN D22); when Russian lands, these images move under a locale segment.
export const seoT = createTranslator({ locale: "en", messages: seo, namespace: "Seo" });
