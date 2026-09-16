// Minimal in-memory reader for the ustar/pax tarballs GitHub produces (`git archive`).
// Only regular files are returned; directories, links and other entry types are skipped.
// Kept in-house so the loader has no extraction dependency and never touches disk.

const BLOCK = 512;

export interface TarFile {
  path: string;
  data: Uint8Array;
}

export interface TarOptions {
  maxFileBytes: number;
}

const decoder = new TextDecoder();

function readString(block: Uint8Array, offset: number, length: number): string {
  const slice = block.subarray(offset, offset + length);
  const end = slice.indexOf(0);
  return decoder.decode(end === -1 ? slice : slice.subarray(0, end));
}

function readOctal(block: Uint8Array, offset: number, length: number): number {
  const text = readString(block, offset, length).trim();
  if (text === "") return 0;
  const value = Number.parseInt(text, 8);
  if (!Number.isFinite(value) || value < 0) throw new Error("invalid tar header size");
  return value;
}

function parsePax(data: Uint8Array): Map<string, string> {
  const records = new Map<string, string>();
  let offset = 0;
  while (offset < data.length) {
    const space = data.indexOf(0x20, offset);
    if (space === -1) break;
    const length = Number.parseInt(decoder.decode(data.subarray(offset, space)), 10);
    if (!Number.isFinite(length) || length <= 0) break;
    const record = decoder.decode(data.subarray(space + 1, offset + length - 1));
    const eq = record.indexOf("=");
    if (eq > 0) records.set(record.slice(0, eq), record.slice(eq + 1));
    offset += length;
  }
  return records;
}

export function readTar(archive: Uint8Array, options: TarOptions): TarFile[] {
  const files: TarFile[] = [];
  let offset = 0;
  let nextPath: string | undefined;

  while (offset + BLOCK <= archive.length) {
    const header = archive.subarray(offset, offset + BLOCK);
    if (header.every((byte) => byte === 0)) break;

    const size = readOctal(header, 124, 12);
    const type = String.fromCharCode(header[156] ?? 0);
    const dataStart = offset + BLOCK;
    const dataEnd = dataStart + size;
    if (dataEnd > archive.length) throw new Error("truncated tar archive");
    const data = archive.subarray(dataStart, dataEnd);
    offset = dataStart + Math.ceil(size / BLOCK) * BLOCK;

    if (type === "x") {
      nextPath = parsePax(data).get("path") ?? nextPath;
      continue;
    }
    if (type === "L") {
      nextPath = readString(data, 0, data.length);
      continue;
    }
    if (type === "g") continue;

    const name = readString(header, 0, 100);
    const prefix = readString(header, 345, 155);
    const path = nextPath ?? (prefix ? `${prefix}/${name}` : name);
    nextPath = undefined;

    if (type !== "0" && type !== "\0") continue;
    if (size > options.maxFileBytes) throw new Error("file in archive exceeds size limit");
    files.push({ path, data: data.slice() });
  }
  return files;
}
