import { getRequestConfig } from "next-intl/server";
import { defaultLocale } from "./config";

// Picked up by the next-intl plugin in next.config.ts. With one locale there is nothing to
// negotiate; when Russian lands, resolve the locale here (cookie or Accept-Language) and load
// `messages/<locale>.json`.
export default getRequestConfig(async () => {
  const locale = defaultLocale;
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
