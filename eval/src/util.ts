// Small helpers shared by the eval scripts.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { format, resolveConfig } from "prettier";

/** `eval/` directory, independent of the working directory the script runs from. */
export const EVAL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Minimal `--flag value` / `--flag` parser; everything else is positional. */
export function parseArgs(argv: string[]): {
  flags: Record<string, string | true>;
  positional: string[];
} {
  const flags: Record<string, string | true> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg.startsWith("--")) {
      const [name, inline] = arg.slice(2).split("=", 2) as [string, string | undefined];
      const next = argv[i + 1];
      if (inline !== undefined) flags[name] = inline;
      else if (next !== undefined && !next.startsWith("--")) {
        flags[name] = next;
        i++;
      } else flags[name] = true;
    } else positional.push(arg);
  }
  return { flags, positional };
}

export function stringFlag(flags: Record<string, string | true>, name: string): string | undefined {
  const value = flags[name];
  if (value === true) throw new Error(`--${name} needs a value`);
  return value;
}

export async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, "utf8")) as unknown;
}

/** Write JSON formatted with the repo's Prettier config, so `pnpm format:check` stays clean. */
export async function writeJson(file: string, data: unknown): Promise<void> {
  const options = (await resolveConfig(file)) ?? {};
  const text = await format(JSON.stringify(data), { ...options, filepath: file });
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text);
}

export function slugify(text: string, max = 60): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Phone-like runs of digit groups. Replaced only when they hold 9 to 15 digits and either start
// with + or use parentheses, or hold 10+ digits split by separators, so salary ranges, dates and
// bare ids are left alone.
const PHONE = /(?<![\w$€£])\+?\(?\d{1,4}\)?(?:[\s.-]?\(?\d{2,5}\)?){2,5}(?![\w-])/g;

/** Remove emails and phone numbers from public post text before it is stored in the repo. */
export function scrubContacts(text: string): string {
  return text.replace(EMAIL, "[email]").replace(PHONE, (match) => {
    const digits = match.replace(/\D/g, "").length;
    const marked = match.startsWith("+") || match.includes("(");
    if (digits < 9 || digits > 15) return match;
    if (!marked && (digits < 10 || !/[\s.-]/.test(match))) return match;
    return "[phone]";
  });
}

/** Deterministic PRNG (mulberry32) so a re-pull with the same seed picks the same posts. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
