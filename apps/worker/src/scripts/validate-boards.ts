// Reads every board in a source list once and reports whether it is live and how many of its jobs
// pass the PLAN D10 role filter. No database. Use it to vet a source list before it ships.
// Usage: pnpm --filter @pemby/worker validate:boards -- [--file <source-list.json>] [--ats a,b]
//          [--include-disabled] [--out <report.json>]
// Without --file it validates every list from loadPrivateConfig(). Vendors in INGEST_DISABLED_ATS
// (default smartrecruiters) are skipped unless --include-disabled. Only list calls are made, never
// job detail calls. Output holds counts, statuses and error kinds, never response bodies.
import { readFile, writeFile } from "node:fs/promises";
import {
  boardRefFromSource,
  createAtsHttpClient,
  getConnector,
  isAtsError,
  isConnectorImplemented,
  type HttpClient,
} from "@pemby/ats";
import { classifyRole, type RoleFamily } from "@pemby/core";
import {
  ATS_KINDS,
  loadPrivateConfig,
  PrivateConfigError,
  sourceListSchema,
  type AtsKind,
  type SourceEntry,
} from "@pemby/core/private-config";

const DEFAULT_DISABLED: readonly AtsKind[] = ["smartrecruiters"];
const DEFAULT_RETRY_AFTER_MS = 60_000;
const MAX_RETRY_AFTER_MS = 5 * 60_000;
const SLOW_DOWN_MS = 3_000;

type BoardStatus = "ok" | "empty" | "not-found" | "rate-limited" | `error:${string}`;

interface BoardReport {
  list: string;
  ats: AtsKind;
  boardToken: string;
  region: "us" | "eu";
  companyName: string | null;
  status: BoardStatus;
  /** HTTP status behind an error, when there was one. */
  httpStatus: number | null;
  listed: number;
  /** Jobs kept by the D10 role filter. */
  kept: number;
  keptByFamily: Partial<Record<RoleFamily, number>>;
  /** Share (0 to 1) of kept jobs with workplaceType remote; null when nothing was kept. */
  keptRemoteShare: number | null;
  /** Distinct hostnames of job posting URLs, to check a board belongs to the expected company. */
  jobUrlHosts: string[];
  retriedAfterRateLimit: boolean;
  ms: number;
}

interface Args {
  file: string | null;
  ats: ReadonlySet<AtsKind> | null;
  includeDisabled: boolean;
  out: string | null;
}

function usage(message: string): never {
  console.error(message);
  console.error(
    "usage: validate:boards -- [--file <source-list.json>] [--ats a,b] [--include-disabled] [--out <report.json>]",
  );
  process.exit(2);
}

function parseAtsList(raw: string, what: string): Set<AtsKind> {
  const kinds = new Set<AtsKind>();
  for (const part of raw.split(",")) {
    const kind = part.trim().toLowerCase();
    if (!kind) continue;
    if (!(ATS_KINDS as readonly string[]).includes(kind)) {
      usage(`${what} has an unknown ATS kind "${kind}"`);
    }
    kinds.add(kind as AtsKind);
  }
  return kinds;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { file: null, ats: null, includeDisabled: false, out: null };
  const rest = argv.filter((a) => a !== "--");
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    const value = (): string => {
      const v = rest[++i];
      if (!v || v.startsWith("--")) usage(`${flag} needs a value`);
      return v;
    };
    if (flag === "--file") args.file = value();
    else if (flag === "--ats") args.ats = parseAtsList(value(), "--ats");
    else if (flag === "--include-disabled") args.includeDisabled = true;
    else if (flag === "--out") args.out = value();
    else usage(`unknown argument "${flag}"`);
  }
  return args;
}

function disabledAts(): ReadonlySet<AtsKind> {
  const raw = process.env.INGEST_DISABLED_ATS;
  if (raw === undefined) return new Set(DEFAULT_DISABLED);
  return parseAtsList(raw, "INGEST_DISABLED_ATS");
}

async function loadEntries(file: string | null): Promise<{ list: string; entry: SourceEntry }[]> {
  if (file) {
    let json: unknown;
    try {
      json = JSON.parse(await readFile(file, "utf8"));
    } catch {
      throw new Error(`cannot read ${file} as JSON`);
    }
    const parsed = sourceListSchema.safeParse(json);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new Error(
        `${file} is not a source list: ${issue ? `${issue.path.join(".")} ${issue.message}` : "invalid"}`,
      );
    }
    return parsed.data.entries.map((entry) => ({ list: file, entry }));
  }
  const config = await loadPrivateConfig();
  return [...config.sourceLists].flatMap(([list, { entries }]) =>
    entries.map((entry) => ({ list, entry })),
  );
}

const sleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });

async function readBoard(
  list: string,
  entry: SourceEntry,
  http: HttpClient,
  signal: AbortSignal,
  onRateLimited: () => void,
): Promise<BoardReport> {
  const ref = boardRefFromSource(entry);
  const connector = getConnector(ref.ats);
  const report: BoardReport = {
    list,
    ats: ref.ats,
    boardToken: ref.boardToken,
    region: ref.region,
    companyName: entry.companyName ?? null,
    status: "ok",
    httpStatus: null,
    listed: 0,
    kept: 0,
    keptByFamily: {},
    keptRemoteShare: null,
    jobUrlHosts: [],
    retriedAfterRateLimit: false,
    ms: 0,
  };
  const started = Date.now();

  for (let attempt = 0; ; attempt++) {
    try {
      const jobs = await connector.listJobs(ref, { http, signal });
      report.status = jobs.length > 0 ? "ok" : "empty";
      report.httpStatus = null;
      report.listed = jobs.length;
      let remote = 0;
      const hosts = new Set<string>();
      for (const job of jobs) {
        try {
          hosts.add(new URL(job.url).hostname);
        } catch {
          // A malformed posting URL says nothing about ownership; ignore it.
        }
        const role = classifyRole({ title: job.title, department: job.department });
        if (!role.keep || !role.family) continue;
        report.kept++;
        report.keptByFamily[role.family] = (report.keptByFamily[role.family] ?? 0) + 1;
        if (job.workplaceType === "remote") remote++;
      }
      report.keptRemoteShare = report.kept > 0 ? remote / report.kept : null;
      report.jobUrlHosts = [...hosts].slice(0, 5);
      break;
    } catch (error) {
      if (signal.aborted) throw error;
      if (!isAtsError(error)) {
        report.status = "error:unexpected";
        break;
      }
      report.httpStatus = error.status ?? null;
      if (error.kind === "board-not-found") {
        report.status = "not-found";
        break;
      }
      if (error.kind !== "rate-limited") {
        report.status = `error:${error.kind}`;
        break;
      }
      onRateLimited();
      if (attempt > 0) {
        report.status = "rate-limited";
        break;
      }
      const waitMs = Math.min(error.retryAfterMs ?? DEFAULT_RETRY_AFTER_MS, MAX_RETRY_AFTER_MS);
      console.error(`  ${ref.ats} ${ref.boardToken}: rate limited, waiting ${waitMs} ms`);
      report.retriedAfterRateLimit = true;
      await sleep(waitMs, signal);
    }
  }
  report.ms = Date.now() - started;
  return report;
}

/** Boards of one vendor, one after another. A 429 adds a pause between the rest of its boards. */
async function readVendor(
  items: { list: string; entry: SourceEntry }[],
  http: HttpClient,
  signal: AbortSignal,
): Promise<BoardReport[]> {
  const reports: BoardReport[] = [];
  let pauseMs = 0;
  for (const [i, { list, entry }] of items.entries()) {
    if (i > 0 && pauseMs > 0) await sleep(pauseMs, signal);
    const report = await readBoard(list, entry, http, signal, () => {
      pauseMs = SLOW_DOWN_MS;
    });
    reports.push(report);
    console.error(
      `  ${report.ats} ${report.boardToken}: ${report.status}${report.httpStatus ? ` (${report.httpStatus})` : ""}, ${report.kept}/${report.listed} kept, ${report.ms} ms`,
    );
  }
  return reports;
}

const isDead = (r: BoardReport) => r.status === "not-found";
const isErroring = (r: BoardReport) => r.status === "rate-limited" || r.status.startsWith("error:");

function printSummary(reports: BoardReport[]): void {
  const byAts = new Map<AtsKind, BoardReport[]>();
  for (const r of reports) byAts.set(r.ats, [...(byAts.get(r.ats) ?? []), r]);
  const rows = [...byAts].map(([ats, rs]) => ({
    ats,
    entries: rs.length,
    ok: rs.filter((r) => r.status === "ok").length,
    empty: rs.filter((r) => r.status === "empty").length,
    dead: rs.filter(isDead).length,
    rateLimited: rs.filter((r) => r.status === "rate-limited").length,
    erroring: rs.filter(isErroring).length,
    listedJobs: rs.reduce((n, r) => n + r.listed, 0),
    keptJobs: rs.reduce((n, r) => n + r.kept, 0),
  }));
  console.table(rows);

  const bad = reports.filter((r) => isDead(r) || isErroring(r));
  if (bad.length === 0) {
    console.log("dead or erroring boards: none");
    return;
  }
  console.log(`dead or erroring boards: ${bad.length}`);
  for (const r of bad) {
    console.log(
      `  ${r.ats}\t${r.boardToken}\t${r.status}${r.httpStatus ? ` ${r.httpStatus}` : ""}`,
    );
  }
}

const args = parseArgs(process.argv.slice(2));
const controller = new AbortController();
process.on("SIGINT", () => controller.abort(new Error("interrupted")));

try {
  const disabled = args.includeDisabled ? new Set<AtsKind>() : disabledAts();
  const all = await loadEntries(args.file);
  const skipped = new Map<string, number>();
  const byVendor = new Map<AtsKind, { list: string; entry: SourceEntry }[]>();
  for (const item of all) {
    const { ats } = item.entry;
    if (args.ats && !args.ats.has(ats)) continue;
    const reason = disabled.has(ats)
      ? `${ats} (disabled)`
      : !isConnectorImplemented(ats)
        ? `${ats} (not implemented)`
        : null;
    if (reason) {
      skipped.set(reason, (skipped.get(reason) ?? 0) + 1);
      continue;
    }
    byVendor.set(ats, [...(byVendor.get(ats) ?? []), item]);
  }
  for (const [reason, count] of skipped) console.error(`skipping ${count} boards: ${reason}`);

  const http = createAtsHttpClient();
  const started = Date.now();
  const reports = (
    await Promise.all(
      [...byVendor.values()].map((items) => readVendor(items, http, controller.signal)),
    )
  ).flat();

  printSummary(reports);
  console.log(`${reports.length} boards in ${Math.round((Date.now() - started) / 1000)} s`);

  if (args.out) {
    const report = {
      generatedAt: new Date().toISOString(),
      input: args.file ?? "private-config",
      skipped: Object.fromEntries(skipped),
      boards: reports,
    };
    await writeFile(args.out, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`report written to ${args.out}`);
  }
} catch (error) {
  if (error instanceof PrivateConfigError) {
    console.error(`${error.code}: ${error.message}`);
  } else {
    console.error(`validate:boards failed: ${error instanceof Error ? error.message : "error"}`);
  }
  process.exitCode = 1;
}
