// Server-only: reads the raw config files from a local directory or a GitHub tarball.
// Returns path -> UTF-8 text for layout files only, plus a version id. Never logs.
import { createHash } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";

import type { PrivateConfigSource } from "./env";
import { PrivateConfigError, redact } from "./errors";
import { readTar } from "./tar";

export interface PrivateConfigVersion {
  source: "dir" | "github";
  /** Requested ref for GitHub (branch, tag or sha); null for a directory. */
  ref: string | null;
  /** Full commit sha for GitHub; `dir-<sha256>` of the file set for a directory. */
  id: string;
  /** 12-character form, used in prompt version ids. */
  shortId: string;
}

export interface RawPrivateConfig {
  files: ReadonlyMap<string, string>;
  version: PrivateConfigVersion;
}

const GITHUB_API = "https://api.github.com";
const GITHUB_API_VERSION = "2026-03-10";
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_ARCHIVE_BYTES = 20 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 50 * 1024 * 1024;
const MAX_FILE_BYTES = 2 * 1024 * 1024;

const LAYOUT_PATH =
  /^(manifest\.json|routing\.json|scoring\/weights\.json|prompts\/[^/]+\.md|sources\/[^/]+\.json)$/;

export function isLayoutPath(path: string): boolean {
  return LAYOUT_PATH.test(path);
}

const utf8 = new TextDecoder("utf-8", { fatal: true });

function decodeFile(path: string, data: Uint8Array): string {
  try {
    return utf8.decode(data);
  } catch {
    throw new PrivateConfigError("invalid-file", `${path} is not valid UTF-8.`);
  }
}

// ---------------------------------------------------------------- directory

/** Relative paths resolve against cwd, then each parent, so package scripts find a root folder. */
function locateDir(dir: string): string {
  if (isAbsolute(dir)) return dir;
  let base = process.cwd();
  for (;;) {
    const candidate = resolve(base, dir);
    if (existsSync(candidate) && statSync(candidate).isDirectory()) return candidate;
    const parent = dirname(base);
    if (parent === base) break;
    base = parent;
  }
  throw new PrivateConfigError(
    "not-found",
    `PRIVATE_CONFIG_DIR "${dir}" was not found from ${process.cwd()} or any parent directory.`,
  );
}

async function listFiles(root: string, sub: string, extension: string): Promise<string[]> {
  try {
    const entries = await readdir(join(root, sub), { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
      .map((entry) => `${sub}/${entry.name}`);
  } catch {
    return [];
  }
}

async function readFromDir(dir: string): Promise<RawPrivateConfig> {
  const root = locateDir(dir);
  const candidates = [
    "manifest.json",
    "routing.json",
    "scoring/weights.json",
    ...(await listFiles(root, "prompts", ".md")),
    ...(await listFiles(root, "sources", ".json")),
  ];
  const files = new Map<string, string>();
  for (const path of candidates) {
    if (!isLayoutPath(path)) continue;
    let data: Buffer;
    try {
      data = await readFile(join(root, path));
    } catch {
      continue;
    }
    if (data.byteLength > MAX_FILE_BYTES) {
      throw new PrivateConfigError("invalid-file", `${path} exceeds ${MAX_FILE_BYTES} bytes.`);
    }
    files.set(path, decodeFile(path, data));
  }

  const hash = createHash("sha256");
  for (const path of [...files.keys()].sort()) {
    hash
      .update(path)
      .update("\0")
      .update(files.get(path) ?? "")
      .update("\0");
  }
  const digest = hash.digest("hex");
  return {
    files,
    version: {
      source: "dir",
      ref: null,
      id: `dir-${digest}`,
      shortId: `dir-${digest.slice(0, 8)}`,
    },
  };
}

// ---------------------------------------------------------------- GitHub

type GithubSource = Extract<PrivateConfigSource, { kind: "github" }>;

function describeStatus(status: number): string {
  switch (status) {
    case 401:
      return "the token was rejected (expired, revoked or malformed)";
    case 403:
      return "access denied or rate limited (check the token's Contents: read permission)";
    case 404:
      return "repository or ref not found, or the token cannot see the repository";
    case 409:
      return "the repository is empty";
    case 422:
      return "the ref does not resolve to a commit";
    default:
      return "unexpected response";
  }
}

async function githubGet(source: GithubSource, path: string, accept: string): Promise<Response> {
  const label = `${source.repo}@${source.ref}`;
  let response: Response;
  try {
    response = await fetch(`${GITHUB_API}${path}`, {
      headers: {
        Accept: accept,
        Authorization: `Bearer ${source.token}`,
        "User-Agent": "pemby-private-config",
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
      },
      redirect: "follow",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    // Do not surface the underlying message: a redirect URL may carry a signed token.
    const code =
      error instanceof Error && "cause" in error && error.cause instanceof Error
        ? ((error.cause as NodeJS.ErrnoException).code ?? error.cause.name)
        : error instanceof Error
          ? error.name
          : "unknown";
    throw new PrivateConfigError(
      "fetch-failed",
      redact(`Network error fetching ${label} from GitHub (${code}).`, [source.token]),
    );
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new PrivateConfigError(
      "fetch-failed",
      `GitHub returned HTTP ${response.status} for ${label}: ${describeStatus(response.status)}.`,
    );
  }
  return response;
}

async function readFromGithub(source: GithubSource): Promise<RawPrivateConfig> {
  const repoPath = `/repos/${source.repo}`;
  const shaResponse = await githubGet(
    source,
    `${repoPath}/commits/${encodeURIComponent(source.ref)}`,
    "application/vnd.github.sha",
  );
  const sha = (await shaResponse.text()).trim();
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    throw new PrivateConfigError(
      "fetch-failed",
      `GitHub did not return a commit sha for ${source.repo}@${source.ref}.`,
    );
  }

  // Fetch the tarball by sha so files and recorded version always agree.
  const tarResponse = await githubGet(
    source,
    `${repoPath}/tarball/${sha}`,
    "application/vnd.github+json",
  );
  const declared = Number(tarResponse.headers.get("content-length") ?? "0");
  if (declared > MAX_ARCHIVE_BYTES) {
    await tarResponse.body?.cancel();
    throw new PrivateConfigError("invalid-layout", "Private config archive is larger than 20 MB.");
  }
  const archive = new Uint8Array(await tarResponse.arrayBuffer());
  if (archive.byteLength > MAX_ARCHIVE_BYTES) {
    throw new PrivateConfigError("invalid-layout", "Private config archive is larger than 20 MB.");
  }

  let entries;
  try {
    const tar = gunzipSync(archive, { maxOutputLength: MAX_UNPACKED_BYTES });
    entries = readTar(new Uint8Array(tar.buffer, tar.byteOffset, tar.byteLength), {
      maxFileBytes: MAX_FILE_BYTES,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown";
    throw new PrivateConfigError(
      "invalid-layout",
      `Could not unpack the archive for ${source.repo}@${sha.slice(0, 12)} (${reason}).`,
    );
  }

  const files = new Map<string, string>();
  for (const entry of entries) {
    // GitHub prefixes every path with "<owner>-<repo>-<short sha>/".
    const slash = entry.path.indexOf("/");
    const path = slash === -1 ? entry.path : entry.path.slice(slash + 1);
    if (isLayoutPath(path)) files.set(path, decodeFile(path, entry.data));
  }
  return {
    files,
    version: { source: "github", ref: source.ref, id: sha, shortId: sha.slice(0, 12) },
  };
}

export function readPrivateConfigFiles(source: PrivateConfigSource): Promise<RawPrivateConfig> {
  return source.kind === "dir" ? readFromDir(source.dir) : readFromGithub(source);
}
