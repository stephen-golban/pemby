import { readFile } from "node:fs/promises";
import path from "node:path";
import type { LegalDocument } from "@/content/legal/meta";

export type TocEntry = { id: string; title: string };

export type ParsedLegalDocument = {
  title: string;
  body: string;
  toc: TocEntry[];
};

/** "13. Acceptable use" -> "acceptable-use". Numbers change when sections move; names rarely do. */
export function slugify(heading: string): string {
  return heading
    .replace(/^\d+\.\s*/, "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Reads `content/legal/<locale>/<doc>.md`. The first `# ` line is the page title; every `## ` line
 * is a section in the table of contents. Called from Server Components only, so the markdown is
 * read and rendered at build time for these static pages.
 */
export async function loadLegalDocument(
  locale: string,
  doc: LegalDocument,
): Promise<ParsedLegalDocument> {
  const file = path.join(process.cwd(), "content", "legal", locale, `${doc}.md`);
  const source = await readFile(file, "utf8");
  const lines = source.split("\n");

  const titleIndex = lines.findIndex((line) => line.startsWith("# "));
  const title = titleIndex >= 0 ? (lines[titleIndex] ?? "").slice(2).trim() : "";
  const body = lines.filter((_, index) => index !== titleIndex).join("\n");

  const toc = lines
    .filter((line) => line.startsWith("## "))
    .map((line) => {
      const heading = line.slice(3).trim();
      return { id: slugify(heading), title: heading };
    });

  return { title, body, toc };
}
