import type messages from "./messages/en.json";
import type admin from "./messages/en/admin.json";
import type brief from "./messages/en/brief.json";
import type cv from "./messages/en/cv.json";
import type delivery from "./messages/en/delivery.json";
import type exportFile from "./messages/en/export.json";
import type kit from "./messages/en/kit.json";
import type legal from "./messages/en/legal.json";
import type onboarding from "./messages/en/onboarding.json";
import type pricing from "./messages/en/pricing.json";
import type seo from "./messages/en/seo.json";
import type settings from "./messages/en/settings.json";
import type tracker from "./messages/en/tracker.json";
import type { Locale } from "./i18n/config";

// Type-safe message keys for next-intl: a missing key is a type error. The runtime merges
// `messages/en.json` with every `messages/en/*.json` (i18n/request.ts); list each namespace file here.
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof messages &
      typeof admin &
      typeof brief &
      typeof cv &
      typeof delivery &
      typeof exportFile &
      typeof kit &
      typeof legal &
      typeof onboarding &
      typeof pricing &
      typeof seo &
      typeof settings &
      typeof tracker;
  }
}
