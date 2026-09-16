import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { AbstractIntlMessages } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { defaultLocale } from "./config";

// Picked up by the next-intl plugin in next.config.ts. With one locale there is nothing to
// negotiate; when Russian lands, resolve the locale here (cookie or Accept-Language).
//
// Messages for a locale are `messages/<locale>.json` deep-merged with every `*.json` file in
// `messages/<locale>/` (one file per feature namespace, so parallel work does not collide in one
// file). Files merge in name order; a later file wins on a conflicting leaf.

type Messages = { [key: string]: string | Messages };

function isObject(value: unknown): value is Messages {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepMerge(target: Messages, source: Messages): Messages {
  const out: Messages = { ...target };
  for (const [key, value] of Object.entries(source)) {
    const existing = out[key];
    out[key] = isObject(existing) && isObject(value) ? deepMerge(existing, value) : value;
  }
  return out;
}

async function namespaceFiles(locale: string): Promise<Messages[]> {
  const dir = path.join(process.cwd(), "messages", locale);
  let names: string[];
  try {
    names = (await readdir(dir)).filter((name) => name.endsWith(".json")).sort();
  } catch {
    return [];
  }
  return Promise.all(
    names.map(async (name) => JSON.parse(await readFile(path.join(dir, name), "utf8")) as Messages),
  );
}

// Development re-reads on every request so message edits show without a restart.
const cache = new Map<string, Promise<Messages>>();

async function loadMessages(locale: string): Promise<Messages> {
  const base = (await import(`../messages/${locale}.json`)).default as Messages;
  const parts = await namespaceFiles(locale);
  return parts.reduce(deepMerge, base);
}

export default getRequestConfig(async () => {
  const locale = defaultLocale;
  let messages = cache.get(locale);
  if (!messages || process.env.NODE_ENV === "development") {
    messages = loadMessages(locale);
    cache.set(locale, messages);
  }
  return { locale, messages: (await messages) as AbstractIntlMessages };
});
