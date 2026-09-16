import type messages from "./messages/en.json";
import type legal from "./messages/en/legal.json";
import type pricing from "./messages/en/pricing.json";
import type seo from "./messages/en/seo.json";
import type { Locale } from "./i18n/config";

// Type-safe message keys for next-intl: a missing key is a type error. The runtime merges
// `messages/en.json` with every `messages/en/*.json` (i18n/request.ts); list each namespace file here.
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof messages & typeof legal & typeof pricing & typeof seo;
  }
}
