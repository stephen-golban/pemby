import type messages from "./messages/en.json";
import type { Locale } from "./i18n/config";

// Type-safe message keys for next-intl: a missing key is a type error.
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof messages;
  }
}
