import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Static TTF instances for `next/og` (Satori takes ttf, otf or woff, not variable woff2). Both are
// SIL OFL 1.1 (licence texts next to the files), vendored from Google Fonts so the images build
// without a network fetch. The site loads the same faces through next/font.
const dir = join(process.cwd(), "app", "_og");

type FontFace = { name: string; data: Buffer; weight: 500 | 800; style: "normal" };

export async function groteskFont(): Promise<FontFace> {
  const data = await readFile(join(dir, "RethinkSans-ExtraBold.ttf"));
  return { name: "Rethink Sans", data, weight: 800, style: "normal" };
}

export async function monoFont(): Promise<FontFace> {
  const data = await readFile(join(dir, "SourceCodePro-Medium.ttf"));
  return { name: "Source Code Pro", data, weight: 500, style: "normal" };
}
