// Shared text normalization for comparing free-text lists (stack, domains, dealbreakers) coming
// from a CV, a post and a person typing. Deliberately blunt and stable: lower case, everything that
// is not a letter or digit collapsed to a single dash. "Node.js" and "node js" both become
// "node-js"; "C++" becomes "c". Pure and isomorphic.

/** Lower-cased, dash-separated slug. Empty string when nothing survives. */
export function slug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Slugs of `values`, de-duplicated, empties dropped. */
export function slugSet(values: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const value of values) {
    const s = slug(value);
    if (s.length > 0) out.add(s);
  }
  return out;
}

/** Members of `wanted` also present in `have`, in `wanted` order, returned as original strings. */
export function intersectBySlug(wanted: readonly string[], have: ReadonlySet<string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of wanted) {
    const s = slug(value);
    if (s.length > 0 && have.has(s) && !seen.has(s)) {
      seen.add(s);
      out.push(value);
    }
  }
  return out;
}

/** Members of `wanted` missing from `have`, in `wanted` order, returned as original strings. */
export function differenceBySlug(wanted: readonly string[], have: ReadonlySet<string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of wanted) {
    const s = slug(value);
    if (s.length > 0 && !have.has(s) && !seen.has(s)) {
      seen.add(s);
      out.push(value);
    }
  }
  return out;
}
