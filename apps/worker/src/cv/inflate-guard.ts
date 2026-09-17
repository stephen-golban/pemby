// Decompression-bomb guard, run on the raw bytes before any parser sees them.
//
// A 5 MB upload can carry a deflate stream that inflates to gigabytes; PDF and DOCX parsers both
// inflate eagerly and keep the result in memory outside the V8 heap. This pre-pass inflates every
// compressed stream itself with a byte budget (`zlib`'s `maxOutputLength`), so a bomb is rejected
// before the parser runs. Filters whose output cannot be bounded cheaply are refused outright.
//
// It is a cheap first line only: PDF stream boundaries are found by scanning, so a crafted file
// can hide a stream from it. The extraction child process's RSS watchdog is the hard limit.
import { inflateRawSync, inflateSync } from "node:zlib";

/** Total inflated bytes allowed across every stream in one file. */
export const INFLATED_TOTAL_MAX_BYTES = 30 * 1024 * 1024;

export type InflateGuardResult = "ok" | "too_large" | "invalid";

/** Filters that can expand their input and that this guard cannot bound cheaply. */
const UNBOUNDED_PDF_FILTERS = ["/LZWDecode", "/RunLengthDecode", "/JBIG2Decode"];

function inflated(chunk: Uint8Array, budget: number, raw: boolean): number | "too_large" | "skip" {
  const options = { maxOutputLength: budget, finishFlush: 2 /* Z_SYNC_FLUSH */ };
  try {
    const out = raw ? inflateRawSync(chunk, options) : inflateSync(chunk, options);
    return out.byteLength;
  } catch (error) {
    // ERR_BUFFER_TOO_LARGE / RangeError: the stream is over what is left of the budget.
    const code = error instanceof Error && "code" in error ? String(error.code) : "";
    if (code === "ERR_BUFFER_TOO_LARGE" || error instanceof RangeError) return "too_large";
    // Not deflate data, or data this guard cut at the wrong boundary: leave it to the parser.
    return "skip";
  }
}

const STREAM = Buffer.from("stream", "latin1");
const ENDSTREAM = Buffer.from("endstream", "latin1");

/**
 * Inflates every `/FlateDecode` stream found by scanning for `stream` ... `endstream`, and rejects
 * the file when the total passes the budget or it uses a filter that cannot be bounded.
 */
export function checkPdfBombs(bytes: Uint8Array): InflateGuardResult {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let budget = INFLATED_TOTAL_MAX_BYTES;
  let at = 0;
  while (at < buffer.length) {
    const start = buffer.indexOf(STREAM, at);
    if (start < 0) break;
    const end = buffer.indexOf(ENDSTREAM, start + STREAM.length);
    if (end < 0) break;
    // The stream's dictionary sits in the 512 bytes before the keyword.
    const header = buffer.toString("latin1", Math.max(0, start - 512), start);
    if (UNBOUNDED_PDF_FILTERS.some((filter) => header.includes(filter))) return "too_large";
    if (header.includes("/FlateDecode")) {
      // Skip the EOL after the `stream` keyword.
      let from = start + STREAM.length;
      if (buffer[from] === 0x0d) from += 1;
      if (buffer[from] === 0x0a) from += 1;
      const result = inflated(buffer.subarray(from, end), budget, false);
      if (result === "too_large") return "too_large";
      if (result !== "skip") budget -= result;
      if (budget <= 0) return "too_large";
    }
    at = end + ENDSTREAM.length;
  }
  return "ok";
}

const LOCAL_SIGNATURE = 0x04034b50;

/**
 * Inflates every entry of a zip from its local headers (what JSZip trusts), so a DOCX whose central
 * directory lies about its sizes is still rejected.
 */
export function checkZipBombs(bytes: Uint8Array): InflateGuardResult {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let budget = INFLATED_TOTAL_MAX_BYTES;
  let at = 0;
  let entries = 0;
  while (at + 30 <= bytes.byteLength && view.getUint32(at, true) === LOCAL_SIGNATURE) {
    const method = view.getUint16(at + 8, true);
    const compressedSize = view.getUint32(at + 18, true);
    const nameLength = view.getUint16(at + 26, true);
    const extraLength = view.getUint16(at + 28, true);
    const from = at + 30 + nameLength + extraLength;
    if (compressedSize === 0 || from + compressedSize > bytes.byteLength) {
      // Streamed entry (size in a trailing data descriptor) or a truncated file: the central
      // directory guard and the child process's limits take it from here.
      return entries > 0 ? "ok" : "invalid";
    }
    const chunk = bytes.subarray(from, from + compressedSize);
    if (method === 8) {
      const result = inflated(chunk, budget, true);
      if (result === "too_large") return "too_large";
      if (result !== "skip") budget -= result;
    } else if (method === 0) {
      budget -= compressedSize;
    } else {
      return "too_large"; // bzip2, LZMA, XZ: not bounded here, and never in a real CV.
    }
    if (budget <= 0) return "too_large";
    entries += 1;
    at = from + compressedSize;
  }
  return entries > 0 ? "ok" : "invalid";
}
