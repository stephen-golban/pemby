// Checks that a model's quote really appears in the post. Normalization is limited to whitespace,
// quote characters and letter case, plus trimming wrapping quote marks and ellipses at the ends,
// so a paraphrase never passes. Isomorphic.

const QUOTE_CHARS: Readonly<Record<string, string>> = {
  "‘": "'",
  "’": "'",
  "‚": "'",
  "‛": "'",
  "′": "'",
  "`": "'",
  "´": "'",
  "“": '"',
  "”": '"',
  "„": '"',
  "‟": '"',
  "″": '"',
  "«": '"',
  "»": '"',
};

interface Normalized {
  text: string;
  /** Source offset of each character of `text`. */
  map: number[];
}

function normalize(source: string): Normalized {
  let text = "";
  const map: number[] = [];
  let pendingSpace = -1;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]!;
    if (/\s/u.test(ch)) {
      if (pendingSpace < 0) pendingSpace = i;
      continue;
    }
    if (pendingSpace >= 0) {
      if (text.length > 0) {
        text += " ";
        map.push(pendingSpace);
      }
      pendingSpace = -1;
    }
    for (const out of (QUOTE_CHARS[ch] ?? ch).toLowerCase()) {
      text += out;
      map.push(i);
    }
  }
  return { text, map };
}

const EDGE_RE = /^[\s"'`‘’“”«».…]+|[\s"'`‘’“”«»…]+$|\.{3,}$/gu;

/** The quote without wrapping quote marks or ellipses. Trailing single periods stay. */
export function trimQuote(quote: string): string {
  let previous: string;
  let current = quote;
  do {
    previous = current;
    current = current.replace(EDGE_RE, "");
  } while (current !== previous);
  return current;
}

export interface QuoteMatch {
  /** UTF-16 offsets in the post text. */
  start: number;
  end: number;
  /** The post's own text for the span. */
  text: string;
}

/** Where `quote` appears in `postText`, or null. Quotes shorter than 4 characters never match. */
export function locateQuote(postText: string, quote: string): QuoteMatch | null {
  const needle = normalize(trimQuote(quote)).text;
  if (needle.length < 4) return null;
  const haystack = normalize(postText);
  const index = haystack.text.indexOf(needle);
  if (index < 0) return null;
  const start = haystack.map[index]!;
  const end = haystack.map[index + needle.length - 1]! + 1;
  return { start, end, text: postText.slice(start, end) };
}
