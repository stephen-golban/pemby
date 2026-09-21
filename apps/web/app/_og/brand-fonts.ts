import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Static TTF instances for `next/og` (Satori takes ttf, otf or woff, not variable woff2). Both are
// instances of the same Hanken Grotesk the site loads through next/font, cut from the SIL OFL 1.1
// variable font (licence text next to the files) so the images build without a network fetch.
//
// One family, two weights: display at 800 and body at 500. There is no monospace in this world.
const dir = join(process.cwd(), "app", "_og");

type FontFace = { name: string; data: Buffer; weight: 500 | 800; style: "normal" };

export async function groteskFont(): Promise<FontFace> {
  const data = await readFile(join(dir, "HankenGrotesk-ExtraBold.ttf"));
  return { name: "Hanken Grotesk", data, weight: 800, style: "normal" };
}

export async function groteskBodyFont(): Promise<FontFace> {
  const data = await readFile(join(dir, "HankenGrotesk-Medium.ttf"));
  return { name: "Hanken Grotesk", data, weight: 500, style: "normal" };
}
