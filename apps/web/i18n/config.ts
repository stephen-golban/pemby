/**
 * Supported locales (PLAN D22). English only for now; Russian is the first to be added.
 * The locale is not part of the URL while there is a single locale.
 */
export const locales = ["en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";
