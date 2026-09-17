// Import labels exported from the labeling sheet into eval/labels/<id>.json.
//
//   pnpm --filter @pemby/eval eval:import <export.json> --session N [--labels-dir dir] [--force]
//
// Validates every post first and writes nothing if any post is invalid. Existing label files are
// only overwritten with --force.
import { access } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { labelFileSchema } from "./schema";
import type { LabelFile } from "./schema";
import { EVAL_DIR, parseArgs, readJson, stringFlag, writeJson } from "./util";

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  const input = positional[0];
  const session = Number(stringFlag(flags, "session"));
  if (!input || !Number.isInteger(session) || session < 1) {
    throw new Error(
      "usage: import-labels.ts <export.json> --session N [--labels-dir dir] [--force]",
    );
  }
  const labelsDir = path.resolve(stringFlag(flags, "labels-dir") ?? path.join(EVAL_DIR, "labels"));

  const raw = await readJson(path.resolve(input));
  const posts = z.array(z.unknown()).parse(raw);
  const valid: LabelFile[] = [];
  const errors: string[] = [];
  const ids = new Set<string>();
  posts.forEach((post, index) => {
    const result = labelFileSchema.safeParse(post);
    const id = (post as { id?: unknown })?.id;
    if (!result.success) {
      errors.push(`#${index} ${String(id)}: ${z.prettifyError(result.error).replace(/\n/g, "; ")}`);
      return;
    }
    if (result.data.session !== session) {
      errors.push(
        `#${index} ${result.data.id}: session ${result.data.session}, expected ${session}`,
      );
      return;
    }
    if (ids.has(result.data.id)) {
      errors.push(`#${index} ${result.data.id}: duplicate id in export`);
      return;
    }
    ids.add(result.data.id);
    valid.push(result.data);
  });
  if (errors.length > 0) {
    console.error(`${errors.length} invalid post(s); nothing written:\n${errors.join("\n")}`);
    process.exit(1);
  }

  let written = 0;
  let skipped = 0;
  for (const label of valid) {
    const file = path.join(labelsDir, `${label.id}.json`);
    if (!flags.force && (await exists(file))) {
      console.warn(`exists, skipped (use --force): ${path.relative(process.cwd(), file)}`);
      skipped++;
      continue;
    }
    await writeJson(file, label);
    written++;
  }
  const pairs = valid.reduce((n, l) => n + l.labels.length, 0);
  console.log(
    `session ${session}: ${written} label file(s) written, ${skipped} skipped, ${pairs} pairs`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
