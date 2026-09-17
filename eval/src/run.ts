// Run an eligibility pipeline over the labeled posts and score it.
//
//   pnpm --filter @pemby/eval eval:run [--pipeline baseline-white | --pipeline-module ./adapter.ts]
//     [--labels-dir dir] [--sessions 1,2] [--ids id1,id2] [--limit N]
//     [--countries MD,UA,GE] [--concurrency 4] [--json report.json] [--report-md report.md]
//
// Zero false greens matters more than overall accuracy:
// - false green: predicted green where the label is yellow, white or red;
// - false red: predicted red where the label is green or yellow.
// `--json` includes label ids and reasons (local use). `--report-md` is numbers only, safe to commit.
import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { ELIGIBILITY_TIERS, ENGINE_VERSION, RULES_VERSION } from "@pemby/core";
import type { EligibilityTier } from "@pemby/core";
import { PIPELINES, PipelineCallError } from "./pipeline";
import type { EligibilityPipeline, PipelineUsage, PipelineVerdict } from "./pipeline";
import { BUCKETS, EVAL_WAYS, labelFileSchema } from "./schema";
import type { Bucket, LabelFile } from "./schema";
import { EVAL_DIR, parseArgs, readJson, stringFlag } from "./util";

/** "none" = the pipeline gave no verdict for the pair, or threw. */
type Predicted = EligibilityTier | "none";
const PREDICTED: Predicted[] = [...ELIGIBILITY_TIERS, "none"];

interface PairResult {
  labelId: string;
  category: Bucket;
  country: string;
  wayOfWorking: string;
  expected: EligibilityTier;
  got: Predicted;
  reason: string;
}

interface Tally {
  total: number;
  correct: number;
  falseGreens: number;
  falseReds: number;
}

const newTally = (): Tally => ({ total: 0, correct: 0, falseGreens: 0, falseReds: 0 });
const pct = (t: Tally) => (t.total === 0 ? "n/a" : `${((100 * t.correct) / t.total).toFixed(1)}%`);

const isFalseGreen = (r: PairResult) => r.got === "green" && r.expected !== "green";
const isFalseRed = (r: PairResult) =>
  r.got === "red" && (r.expected === "green" || r.expected === "yellow");
const yellowOrBetter = (t: Predicted) => t === "green" || t === "yellow";

/** Schema outcome of a post's model output; "invalid" and "error" posts count as `none`. */
const OUTCOMES = ["ok", "repaired", "invalid", "error"] as const;
type Outcome = (typeof OUTCOMES)[number];

interface Recall {
  labeled: number;
  hit: number;
}
const recallPct = (r: Recall) =>
  r.labeled === 0 ? "n/a" : `${((100 * r.hit) / r.labeled).toFixed(1)}%`;

const percentile = (sorted: number[], p: number) =>
  Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0);

function add(tally: Tally, r: PairResult): void {
  tally.total++;
  if (r.got === r.expected) tally.correct++;
  if (isFalseGreen(r)) tally.falseGreens++;
  if (isFalseRed(r)) tally.falseReds++;
}

async function loadLabels(dir: string): Promise<LabelFile[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  const labels: LabelFile[] = [];
  for (const file of files) {
    const result = labelFileSchema.safeParse(await readJson(path.join(dir, file)));
    if (!result.success) throw new Error(`${file}: ${result.error.message}`);
    if (`${result.data.id}.json` !== file)
      throw new Error(`${file}: id ${result.data.id} does not match file name`);
    labels.push(result.data);
  }
  return labels;
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const index = next++;
      out[index] = await fn(items[index]!);
    }
  });
  await Promise.all(workers);
  return out;
}

/** `--pipeline <name>` from PIPELINES, or `--pipeline-module <file>` whose default export is one. */
async function resolvePipeline(flags: Record<string, string | true>): Promise<EligibilityPipeline> {
  const modulePath = stringFlag(flags, "pipeline-module");
  if (modulePath) {
    const mod = (await import(pathToFileURL(path.resolve(modulePath)).href)) as {
      default?: EligibilityPipeline;
    };
    if (!mod.default || typeof mod.default.evaluate !== "function") {
      throw new Error(`${modulePath} has no default export with evaluate()`);
    }
    return mod.default;
  }
  const name = stringFlag(flags, "pipeline") ?? "baseline-white";
  const load = PIPELINES[name];
  if (!load)
    throw new Error(`unknown pipeline ${name}; known: ${Object.keys(PIPELINES).join(", ")}`);
  return load();
}

async function main(): Promise<void> {
  const { flags } = parseArgs(process.argv.slice(2));
  const pipeline = await resolvePipeline(flags);
  const labelsDir = path.resolve(stringFlag(flags, "labels-dir") ?? path.join(EVAL_DIR, "labels"));
  const onlyCountries = stringFlag(flags, "countries")
    ?.split(",")
    .map((c) => c.trim().toUpperCase());
  const concurrency = Number(stringFlag(flags, "concurrency") ?? 4);

  const onlyIds = stringFlag(flags, "ids")
    ?.split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const limitFlag = stringFlag(flags, "limit");
  const limit = limitFlag === undefined ? undefined : Number(limitFlag);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
    throw new Error("--limit must be a positive integer");
  }

  // `--sessions 1,2`: only labels from these labeling sessions. Session 3+ is the holdout.
  const onlySessions = stringFlag(flags, "sessions")
    ?.split(",")
    .map((value) => Number(value.trim()));
  if (onlySessions?.some((n) => !Number.isInteger(n) || n < 1)) {
    throw new Error("--sessions must be a comma-separated list of positive integers");
  }

  let labels = await loadLabels(labelsDir);
  if (onlySessions) labels = labels.filter((l) => onlySessions.includes(l.session));
  if (onlyIds) {
    const missing = onlyIds.filter((id) => !labels.some((l) => l.id === id));
    if (missing.length > 0) throw new Error(`unknown label ids: ${missing.join(", ")}`);
    labels = labels.filter((l) => onlyIds.includes(l.id));
  }
  if (limit !== undefined) labels = labels.slice(0, limit);
  if (labels.length === 0) throw new Error(`no label files in ${labelsDir}`);

  const usage = { costUsd: 0, inputTokens: 0, outputTokens: 0, calls: 0 };
  let usageReported = false;
  /** Cost of calls made by this run (cached posts excluded). */
  let spentUsd = 0;
  let cachedPosts = 0;
  const latencies: number[] = [];
  const modelLatencies: number[] = [];
  const outcomes: Record<Outcome, number> = { ok: 0, repaired: 0, invalid: 0, error: 0 };
  let outcomesReported = false;
  const addUsage = (u: PipelineUsage) => {
    usageReported = true;
    usage.costUsd += u.costUsd ?? 0;
    usage.inputTokens += u.inputTokens ?? 0;
    usage.outputTokens += u.outputTokens ?? 0;
    usage.calls += u.calls ?? 0;
    if (u.cached) cachedPosts++;
    else spentUsd += u.costUsd ?? 0;
    if (u.modelLatencyMs !== undefined) modelLatencies.push(u.modelLatencyMs);
  };
  const errors: { labelId: string; message: string }[] = [];

  const perPost = await mapLimit(labels, concurrency, async (label): Promise<PairResult[]> => {
    const pairs = label.labels.filter((l) => !onlyCountries || onlyCountries.includes(l.country));
    const countries = [...new Set(pairs.map((p) => p.country))];
    const ways = EVAL_WAYS.filter((w) => pairs.some((p) => p.wayOfWorking === w));
    let verdicts: PipelineVerdict[] = [];
    let failure: string | undefined;
    const started = performance.now();
    try {
      const output = await pipeline.evaluate(label.snapshot, countries, ways);
      if (Array.isArray(output)) verdicts = output;
      else {
        verdicts = output.verdicts;
        if (output.usage) addUsage(output.usage);
        if (output.outcome) {
          outcomesReported = true;
          outcomes[output.outcome]++;
        }
      }
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
      if (error instanceof PipelineCallError) {
        outcomesReported = true;
        outcomes[error.outcome]++;
        if (error.usage) addUsage(error.usage);
      }
      errors.push({ labelId: label.id, message: failure });
    }
    latencies.push(performance.now() - started);
    return pairs.map((pair) => {
      const verdict = verdicts.find(
        (v) => v.country === pair.country && v.wayOfWorking === pair.wayOfWorking,
      );
      return {
        labelId: label.id,
        category: label.category,
        country: pair.country,
        wayOfWorking: pair.wayOfWorking,
        expected: pair.tier,
        got: verdict?.tier ?? "none",
        reason: verdict?.reason ?? (failure ? `error: ${failure}` : "no verdict"),
      };
    });
  });
  const results = perPost.flat();

  // Aggregate.
  const overall = newTally();
  const confusion = Object.fromEntries(
    ELIGIBILITY_TIERS.map((e) => [e, Object.fromEntries(PREDICTED.map((p) => [p, 0]))]),
  ) as Record<EligibilityTier, Record<Predicted, number>>;
  const byBucket = new Map<Bucket, Tally & { posts: number }>();
  const byPair = new Map<string, Tally>();
  for (const bucket of BUCKETS) {
    const posts = labels.filter((l) => l.category === bucket).length;
    if (posts > 0) byBucket.set(bucket, { ...newTally(), posts });
  }
  for (const r of results) {
    add(overall, r);
    confusion[r.expected][r.got]++;
    add(byBucket.get(r.category)!, r);
    const key = `${r.country} ${r.wayOfWorking}`;
    if (!byPair.has(key)) byPair.set(key, newTally());
    add(byPair.get(key)!, r);
  }
  const greenRecall: Recall = {
    labeled: results.filter((r) => r.expected === "green").length,
    hit: results.filter((r) => r.expected === "green" && r.got === "green").length,
  };
  const yellowOrBetterRecall: Recall = {
    labeled: results.filter((r) => yellowOrBetter(r.expected)).length,
    hit: results.filter((r) => yellowOrBetter(r.expected) && yellowOrBetter(r.got)).length,
  };
  const falseGreens = results.filter(isFalseGreen);
  const falseReds = results.filter(isFalseRed);
  const sorted = [...latencies].sort((a, b) => a - b);
  const latency = {
    totalMs: Math.round(latencies.reduce((a, b) => a + b, 0)),
    meanMs: Math.round(latencies.reduce((a, b) => a + b, 0) / Math.max(1, latencies.length)),
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
  };
  const modelSorted = [...modelLatencies].sort((a, b) => a - b);
  const modelLatency =
    modelSorted.length === 0
      ? null
      : {
          posts: modelSorted.length,
          meanMs: Math.round(modelSorted.reduce((a, b) => a + b, 0) / modelSorted.length),
          p50Ms: percentile(modelSorted, 0.5),
          p95Ms: percentile(modelSorted, 0.95),
        };
  const costPerPostUsd = usageReported ? usage.costUsd / labels.length : null;

  // Print.
  const lines: string[] = [];
  const log = (s = "") => lines.push(s);
  log(`pipeline: ${pipeline.name}`);
  log(`posts: ${labels.length}, pairs: ${overall.total}, errors: ${errors.length}`);
  log(`accuracy: ${pct(overall)} (${overall.correct}/${overall.total})`);
  log(`false greens: ${overall.falseGreens}   false reds: ${overall.falseReds}`);
  log(
    `green recall: ${recallPct(greenRecall)} (${greenRecall.hit}/${greenRecall.labeled})   yellow-or-better recall: ${recallPct(yellowOrBetterRecall)} (${yellowOrBetterRecall.hit}/${yellowOrBetterRecall.labeled})`,
  );
  log(`versions: ${RULES_VERSION}, ${ENGINE_VERSION}`);
  if (outcomesReported)
    log(`schema outcomes: ${OUTCOMES.map((o) => `${o} ${outcomes[o]}`).join(", ")}`);
  log();
  log("confusion (rows expected, columns got)");
  log(`${"".padEnd(8)}${PREDICTED.map((p) => p.padStart(8)).join("")}`);
  for (const e of ELIGIBILITY_TIERS) {
    log(`${e.padEnd(8)}${PREDICTED.map((p) => String(confusion[e][p]).padStart(8)).join("")}`);
  }
  log();
  log(`false greens (${falseGreens.length})`);
  for (const r of falseGreens) {
    log(
      `  ${r.labelId}  ${r.country} ${r.wayOfWorking}  expected ${r.expected}, got ${r.got}: ${r.reason}`,
    );
  }
  log(`false reds (${falseReds.length})`);
  for (const r of falseReds) {
    log(
      `  ${r.labelId}  ${r.country} ${r.wayOfWorking}  expected ${r.expected}, got ${r.got}: ${r.reason}`,
    );
  }
  log();
  log("per bucket                  posts  pairs  accuracy  FG  FR");
  for (const [bucket, t] of byBucket) {
    log(
      `  ${bucket.padEnd(25)} ${String(t.posts).padStart(5)} ${String(t.total).padStart(6)} ${pct(t).padStart(9)} ${String(t.falseGreens).padStart(3)} ${String(t.falseReds).padStart(3)}`,
    );
  }
  log("per country and way         pairs  accuracy  FG  FR");
  for (const [key, t] of [...byPair].sort()) {
    log(
      `  ${key.padEnd(25)} ${String(t.total).padStart(6)} ${pct(t).padStart(9)} ${String(t.falseGreens).padStart(3)} ${String(t.falseReds).padStart(3)}`,
    );
  }
  log();
  log(
    `latency per post: mean ${latency.meanMs} ms, p50 ${latency.p50Ms} ms, p95 ${latency.p95Ms} ms, total ${latency.totalMs} ms`,
  );
  if (modelLatency) {
    log(
      `model latency per post (${modelLatency.posts} posts, cached included): mean ${modelLatency.meanMs} ms, p50 ${modelLatency.p50Ms} ms, p95 ${modelLatency.p95Ms} ms`,
    );
  }
  if (usageReported) {
    log(
      `usage: $${usage.costUsd.toFixed(4)} ($${(costPerPostUsd! * 1000).toFixed(2)} per 1,000 posts), ${usage.calls} calls, ${usage.inputTokens} in / ${usage.outputTokens} out tokens; spent this run $${spentUsd.toFixed(4)} (${cachedPosts} posts from cache)`,
    );
  } else log("usage: not reported by this pipeline");
  for (const e of errors) log(`error ${e.labelId}: ${e.message}`);
  console.log(lines.join("\n"));

  const summary = {
    pipeline: pipeline.name,
    ranAt: new Date().toISOString(),
    posts: labels.length,
    pairs: overall.total,
    errors: errors.length,
    accuracy: overall.total ? overall.correct / overall.total : null,
    correct: overall.correct,
    falseGreens: overall.falseGreens,
    falseReds: overall.falseReds,
    greenRecall,
    yellowOrBetterRecall,
    rulesVersion: RULES_VERSION,
    engineVersion: ENGINE_VERSION,
    outcomes: outcomesReported ? outcomes : null,
    confusion,
    perBucket: Object.fromEntries(byBucket),
    perCountryWay: Object.fromEntries(byPair),
    latency,
    modelLatency,
    usage: usageReported ? { ...usage, costPerPostUsd, spentUsd, cachedPosts } : null,
  };

  const jsonPath = stringFlag(flags, "json");
  if (jsonPath) {
    const full = {
      ...summary,
      falseGreenList: falseGreens,
      falseRedList: falseReds,
      errorList: errors,
      results,
    };
    await writeFile(path.resolve(jsonPath), `${JSON.stringify(full, null, 2)}\n`);
    console.log(`\nwrote ${jsonPath}`);
  }
  const mdPath = stringFlag(flags, "report-md");
  if (mdPath) {
    await writeFile(path.resolve(mdPath), markdown(summary));
    console.log(`wrote ${mdPath}`);
  }
}

type Summary = {
  pipeline: string;
  ranAt: string;
  posts: number;
  pairs: number;
  errors: number;
  correct: number;
  falseGreens: number;
  falseReds: number;
  greenRecall: Recall;
  yellowOrBetterRecall: Recall;
  rulesVersion: string;
  engineVersion: string;
  outcomes: Record<Outcome, number> | null;
  confusion: Record<EligibilityTier, Record<Predicted, number>>;
  perBucket: Record<string, Tally & { posts: number }>;
  perCountryWay: Record<string, Tally>;
  latency: { totalMs: number; meanMs: number; p50Ms: number; p95Ms: number };
  modelLatency: { posts: number; meanMs: number; p50Ms: number; p95Ms: number } | null;
  usage: {
    costUsd: number;
    inputTokens: number;
    outputTokens: number;
    calls: number;
    costPerPostUsd: number | null;
    spentUsd: number;
    cachedPosts: number;
  } | null;
};

/** Numbers only: no label ids, titles, companies, reasons or post text. */
function markdown(s: Summary): string {
  const t = (x: Tally) => pct(x);
  const out: string[] = [];
  out.push(`# Eligibility accuracy: ${s.pipeline}`, "");
  out.push(
    `Run ${s.ranAt}. ${s.posts} posts, ${s.pairs} (country, way of working) pairs, ${s.errors} errors. ${s.rulesVersion}, ${s.engineVersion}.`,
    "",
  );
  out.push("| Metric | Value |", "| --- | --- |");
  out.push(
    `| Accuracy | ${t({ total: s.pairs, correct: s.correct, falseGreens: 0, falseReds: 0 })} (${s.correct}/${s.pairs}) |`,
  );
  out.push(`| False greens | ${s.falseGreens} |`);
  out.push(`| False reds | ${s.falseReds} |`);
  out.push(
    `| Green recall (labeled green, got green) | ${recallPct(s.greenRecall)} (${s.greenRecall.hit}/${s.greenRecall.labeled}) |`,
  );
  out.push(
    `| Yellow-or-better recall (labeled green or yellow, got green or yellow) | ${recallPct(s.yellowOrBetterRecall)} (${s.yellowOrBetterRecall.hit}/${s.yellowOrBetterRecall.labeled}) |`,
  );
  if (s.outcomes) {
    out.push(
      `| Schema outcomes (${OUTCOMES.join(" / ")}) | ${OUTCOMES.map((o) => s.outcomes![o]).join(" / ")} |`,
    );
  }
  out.push(
    `| Latency per post (mean / p50 / p95) | ${s.latency.meanMs} / ${s.latency.p50Ms} / ${s.latency.p95Ms} ms |`,
  );
  if (s.modelLatency) {
    out.push(
      `| Model latency per post (mean / p50 / p95) | ${s.modelLatency.meanMs} / ${s.modelLatency.p50Ms} / ${s.modelLatency.p95Ms} ms |`,
    );
  }
  if (s.usage) {
    out.push(
      `| Cost | $${s.usage.costUsd.toFixed(4)} ($${(s.usage.costPerPostUsd ?? 0).toFixed(6)} per post, $${((s.usage.costPerPostUsd ?? 0) * 1000).toFixed(2)} per 1,000 posts) |`,
    );
    out.push(
      `| Model calls / tokens in / out | ${s.usage.calls} / ${s.usage.inputTokens} / ${s.usage.outputTokens} |`,
    );
  }
  out.push("", "## Confusion (rows expected, columns got)", "");
  out.push(`| expected \\ got | ${PREDICTED.join(" | ")} |`);
  out.push(`| --- | ${PREDICTED.map(() => "---").join(" | ")} |`);
  for (const e of ELIGIBILITY_TIERS) {
    out.push(`| ${e} | ${PREDICTED.map((p) => s.confusion[e][p]).join(" | ")} |`);
  }
  out.push(
    "",
    "## Per bucket",
    "",
    "| Bucket | Posts | Pairs | Accuracy | False greens | False reds |",
  );
  out.push("| --- | --- | --- | --- | --- | --- |");
  for (const [bucket, x] of Object.entries(s.perBucket)) {
    out.push(
      `| ${bucket} | ${x.posts} | ${x.total} | ${t(x)} | ${x.falseGreens} | ${x.falseReds} |`,
    );
  }
  out.push(
    "",
    "## Per country and way of working",
    "",
    "| Pair | Pairs | Accuracy | False greens | False reds |",
  );
  out.push("| --- | --- | --- | --- | --- |");
  for (const [key, x] of Object.entries(s.perCountryWay)) {
    out.push(`| ${key} | ${x.total} | ${t(x)} | ${x.falseGreens} | ${x.falseReds} |`);
  }
  return `${out.join("\n")}\n`;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
