// Magic-byte check for the two accepted CV types. The real validation is a successful parse in
// the worker; this rejects everything else before it reaches the bucket.

export const CV_MAX_BYTES = 5 * 1024 * 1024;

export type CvFileType = { kind: "pdf" | "docx"; mime: string; fileName: string };

const PDF: CvFileType = { kind: "pdf", mime: "application/pdf", fileName: "cv.pdf" };
const DOCX: CvFileType = {
  kind: "docx",
  mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  fileName: "cv.docx",
};

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.every((b, i) => bytes[i] === b);
}

function containsAscii(bytes: Uint8Array, needle: string): boolean {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).includes(
    needle,
    0,
    "latin1",
  );
}

/**
 * `%PDF-` at offset 0, or a zip (`PK\x03\x04`) that names `word/document.xml` in its entries.
 * The file name and the browser's type are ignored.
 */
export function sniffCvType(bytes: Uint8Array): CvFileType | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return PDF;
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) && containsAscii(bytes, "word/document.xml"))
    return DOCX;
  return null;
}
