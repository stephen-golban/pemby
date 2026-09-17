// Cheap zip-bomb guard for DOCX: reads the declared uncompressed sizes from the zip central
// directory without inflating anything. Declared sizes can lie; the extraction thread's memory
// limit and the 20 s timeout are the backstop.

export const DOCX_DOCUMENT_XML_MAX_BYTES = 20 * 1024 * 1024;
export const DOCX_TOTAL_UNCOMPRESSED_MAX_BYTES = 50 * 1024 * 1024;

export type ZipGuardResult = "ok" | "too_large" | "invalid";

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;

export function checkDocxZip(bytes: Uint8Array): ZipGuardResult {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // End of central directory: 22 bytes plus a comment of up to 65,535 bytes.
  let eocd = -1;
  for (let i = bytes.byteLength - 22; i >= Math.max(0, bytes.byteLength - 22 - 65_535); i--) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return "invalid";
  const entries = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  // ZIP64 markers: a CV has no business needing them.
  if (entries === 0xffff || offset === 0xffffffff) return "too_large";

  let total = 0;
  let sawDocument = false;
  for (let n = 0; n < entries; n++) {
    if (offset + 46 > bytes.byteLength || view.getUint32(offset, true) !== CENTRAL_SIGNATURE) {
      return "invalid";
    }
    const uncompressed = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    if (offset + 46 + nameLength > bytes.byteLength) return "invalid";
    const name = Buffer.from(bytes.buffer, bytes.byteOffset + offset + 46, nameLength).toString(
      "latin1",
    );
    if (uncompressed === 0xffffffff) return "too_large";
    total += uncompressed;
    if (name === "word/document.xml") {
      sawDocument = true;
      if (uncompressed > DOCX_DOCUMENT_XML_MAX_BYTES) return "too_large";
    }
    if (total > DOCX_TOTAL_UNCOMPRESSED_MAX_BYTES) return "too_large";
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return sawDocument ? "ok" : "invalid";
}
