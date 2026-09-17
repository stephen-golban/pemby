// Pull candidate posts for the labeling sessions from the staging database (read-only).
//
//   RAILWAY_SERVICE=worker scripts/dev-staging.sh pnpm --filter @pemby/eval eval:pull \
//     [--countries MD,UA,GE] [--count 80] [--seed 5] [--out-dir dir]
//     [--session N] [--exclude-labeled]
//
// Only open, non-demo, canonical jobs. Each post lands in one tricky-case bucket, at most 2 posts
// per company, spread across ATS sources.
//
// With no `--session`, picks split into two balanced files, `candidates/session-1.json` and
// `session-2.json` (the original behaviour). With `--session N`, all picks go to one file,
// `candidates/session-N.json` — used for later sessions (for example a holdout set). `--count`
// is the total picked (across both files in the default two-session mode). `--seed` accepts a
// number or an arbitrary string (hashed to a number) so a later pull can use a distinct,
// reproducible order. `--exclude-labeled` drops every job id already in `labels/*.json` or
// `candidates/session-1.json` / `session-2.json`, and caps companies already appearing there to
// at most 1 post in the new pull (on top of the normal 2-per-company cap for new companies).
import { readdir } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { COUNTRY_INFO, georgiaLooksLikeUsState, parseCountries, stripUsGeorgia } from "./countries";
import { BUCKETS, EVAL_WAYS, candidatesFileSchema } from "./schema";
import type { Bucket, Candidate, CandidatesFile } from "./schema";
import {
  EVAL_DIR,
  parseArgs,
  readJson,
  scrubContacts,
  seededRandom,
  shuffle,
  slugify,
  stringFlag,
  writeJson,
} from "./util";

interface JobRow {
  id: string;
  url: string;
  source: string;
  title: string;
  location_text: string | null;
  locations: string[];
  workplace_type: string | null;
  employment_type: string | null;
  raw_text: string;
  company: string;
  company_slug: string;
}

interface Job extends JobRow {
  loc: string;
  text: string;
}

const MAX_PER_COMPANY = 2;
/** Buckets that get the leftover slots when the total doesn't divide evenly. */
const PRIORITY: Bucket[] = [
  "emea",
  "eu-work-authorization",
  "contractors-worldwide",
  "country-list",
];

// Country names for spotting careers-page style lists. Not exhaustive; enough to count a list.
const COUNTRY_NAMES = [
  "Albania",
  "Argentina",
  "Armenia",
  "Australia",
  "Austria",
  "Belgium",
  "Bosnia",
  "Brazil",
  "Bulgaria",
  "Canada",
  "Chile",
  "China",
  "Colombia",
  "Costa Rica",
  "Croatia",
  "Cyprus",
  "Czechia",
  "Czech Republic",
  "Denmark",
  "Egypt",
  "Estonia",
  "Finland",
  "France",
  "Georgia",
  "Germany",
  "Greece",
  "Hungary",
  "India",
  "Indonesia",
  "Ireland",
  "Israel",
  "Italy",
  "Japan",
  "Kazakhstan",
  "Kenya",
  "Latvia",
  "Lithuania",
  "Luxembourg",
  "Malaysia",
  "Malta",
  "Mexico",
  "Moldova",
  "Montenegro",
  "Morocco",
  "Netherlands",
  "New Zealand",
  "Nigeria",
  "North Macedonia",
  "Norway",
  "Pakistan",
  "Peru",
  "Philippines",
  "Poland",
  "Portugal",
  "Romania",
  "Serbia",
  "Singapore",
  "Slovakia",
  "Slovenia",
  "South Africa",
  "Spain",
  "Sweden",
  "Switzerland",
  "Turkey",
  "Türkiye",
  "Ukraine",
  "United Kingdom",
  "UK",
  "United States",
  "USA",
  "Uruguay",
  "Vietnam",
  "Azerbaijan",
  "Uzbekistan",
  "Belarus",
  "Iceland",
  "Ecuador",
  "Guatemala",
  "Thailand",
];
const COUNTRY_RE = new RegExp(
  `\\b(${COUNTRY_NAMES.map((n) => n.replace(/ /g, "\\s+")).join("|")})\\b`,
  "g",
);

function countCountries(text: string): string[] {
  const found = new Set<string>();
  for (const m of stripUsGeorgia(text).matchAll(COUNTRY_RE)) {
    found.add(m[1]!.replace(/\s+/g, " ").replace(/^(USA|United States)$/, "US"));
  }
  return [...found];
}

function quote(match: RegExpMatchArray | null): string {
  return match ? `"${match[0].replace(/\s+/g, " ").slice(0, 80)}"` : "";
}

/** Sentences (split on new lines and sentence ends) of a text. */
function sentencesOf(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/))
    .map((s) => s.trim().replace(/^(?:[*•·-]\s+)+/, ""))
    .filter((s) => s.length >= 15);
}

/** First sentence where every pattern matches; returns the match of the first pattern. */
function sentenceWith(text: string, ...patterns: RegExp[]): RegExpMatchArray | null {
  for (const sentence of sentencesOf(text)) {
    if (patterns.every((p) => p.test(sentence))) return sentence.match(patterns[0]!);
  }
  return null;
}

// Hiring-engagement wording ("B2B contract", "via our EOR partner"), not "B2B SaaS" or "manage contractors".
const ENGAGE =
  /\b(independent contractors?|(?:1099|freelance|b2b)\s*\(?(?:contractor|contract)\b|as an? (?:1099 |independent )?contractor\b|contractor (?:role|position|basis|agreement|arrangement|options?)\b|(?:employee|employment|full[- ]time)\s*(?:&|and|or|\/)\s*contractor\b(?! privacy)|B2B (?:contract|contractor|agreement|basis|cooperation|invoice|only)\b|(?:on|net) (?:a )?B2B\b|(?:via|through|using|with) (?:our |an? )?(?:Deel|Oyster|Remote\.com|Rippling|employer[- ]of[- ]record|EOR)\b|employer[- ]of[- ]record|\(EOR\)|EOR (?:partner|vendor|provider)|freelance \(contractor\)|\(contractor\))/i;
const WORLDWIDE =
  /\b(worldwide|anywhere in the world|work from anywhere|from anywhere|globally remote|remote[ ,-]+global|any country|all over the world|around the world|hire (?:talent )?globally|in many countries)\b/i;
const HIRING_CONTEXT =
  /\b(hire|hiring|remote|based|live|located|candidates|work from|team members|employees)\b/i;
const LOC_WORLDWIDE = /\b(worldwide|global|anywhere)\b/i;
const EU_AUTH =
  /\b(authori[sz]ed|authori[sz]ation|eligible|eligibility|right|permit(?:ted)?|legally able)\s+(?:\w+\s+){0,3}(?:to\s+)?(?:live and )?work\s+(?:\w+\s+){0,2}(?:in|within|across)\s+(?:the\s+|an?\s+)?(EU|EEA|European Union|European Economic Area|Europe|Schengen)\b|\b(EU|EEA)\s+(work permit|work visa|work authori[sz]ation|citizen(?:ship)?|passport|right to work|residen(?:ce|cy)|resident)\b|\bvalid (?:EU|EEA) \w+|\b(?:based|located|living|residing|resident)\s+(?:\w+\s+){0,2}in\s+(?:the\s+|an?\s+)?(EU|EEA|European Union)\b|\bEU-based\b/i;
const TZ_STRONG =
  /\b(?:UTC|GMT)\s*[+±-]\s*\d|\b(?:CET|CEST|EET|EST|EDT|PST|PDT|CST|ET|PT)\b[^.\n]{0,40}\b(?:hours|time|overlap)\b|\bhours? of overlap\b|\boverlap with\b/i;
const TZ_WEAK = /\btime ?zones?\b/i;
const EMEA = /\bEMEA\b/;
const EUROPE_LOC = /\b(Europe|European Union|EU)\b/i;
const EUROPE_TEXT =
  /\b(?:based in|located in|reside in|residing in|living in|anywhere in|remote (?:in|within|across))\s+(?:\w+\s+){0,2}Europe\b|\bEuropean time ?zones?\b/i;
const OTHER_REGION =
  /\b(LATAM|Latin America|South America|Central America|APAC|APJ|Asia[- ]Pacific|(?<!South )Africa|Middle East|MENA|North America|Americas|Southeast Asia|ANZ)\b/i;
const US = /\b(US|USA|U\.S\.A?\.?|United States)\b/;
const REMOTE_ONLY = /^(fully |100% )?remote(\s*[-,/(]\s*(remote|flexible)\)?)?$/i;
const GEO_WORDS =
  /\b(remote|anywhere|worldwide|global|fully|flexible|home based|home-based|work from home)\b/gi;

interface Match {
  why: string;
  /** Strong matches are picked before weak ones. */
  strong: boolean;
  /** Picks prefer variety of this value inside a bucket (country, region). */
  variant?: string;
}

type Heuristic = (job: Job, targets: string[]) => Match | null;

/** A target country appears in the location, or clearly in the description. */
function targetMention(job: Job, targets: string[]): Match | null {
  const loc = stripUsGeorgia(job.loc);
  const text = stripUsGeorgia(job.text);
  for (const code of targets) {
    const { name, terms } = COUNTRY_INFO[code]!;
    const inLoc = code === "GE" && georgiaLooksLikeUsState(loc) ? null : loc.match(terms);
    if (inLoc)
      return { why: `location mentions ${name}: ${quote(inLoc)}`, strong: true, variant: code };
    // "Georgia" alone in a description is usually the US state; demand a city or a neighbour.
    const inText =
      code === "GE"
        ? (text.match(/\b(tbilisi|batumi)\b/i) ??
          sentenceWith(
            text,
            terms,
            /\b(Armenia|Moldova|Ukraine|Azerbaijan|Serbia|Poland|Romania)\b/,
          ))
        : text.match(terms);
    if (inText)
      return { why: `description mentions ${name}: ${quote(inText)}`, strong: true, variant: code };
  }
  return null;
}

const HEURISTICS: Record<Bucket, Heuristic> = {
  "mentions-target-country": targetMention,
  "contractors-worldwide": (job) => {
    const e = job.text.match(ENGAGE) ?? job.loc.match(ENGAGE);
    if (!e) return null;
    const broadLoc = LOC_WORLDWIDE.test(job.loc) || HEURISTICS["bare-remote"](job, []) !== null;
    const w = job.loc.match(LOC_WORLDWIDE) ?? sentenceWith(job.text, WORLDWIDE, HIRING_CONTEXT);
    if (w || broadLoc) {
      return {
        why: `contractor/EOR ${quote(e)} + worldwide ${w ? quote(w) : `location "${job.loc}"`}`,
        strong: true,
      };
    }
    // Engagement wording without worldwide text still exercises the contractor/EOR rules.
    return { why: `contractor/EOR ${quote(e)}, location "${job.loc.slice(0, 60)}"`, strong: false };
  },
  "eu-work-authorization": (job) => {
    const m = job.text.match(EU_AUTH) ?? job.loc.match(EU_AUTH);
    return m ? { why: `EU/EEA work authorization ${quote(m)}`, strong: true } : null;
  },
  "country-list": (job) => {
    const inLoc = countCountries(job.loc);
    if (inLoc.length >= 4) return { why: `location lists ${inLoc.length} countries`, strong: true };
    for (const line of job.text.split(/\n|(?<=[.;:])\s+/)) {
      const found = countCountries(line);
      if (
        found.length >= 5 &&
        /\b(hire|hiring|based|located|reside|remote|eligible|countries)\b/i.test(line)
      ) {
        return { why: `description line lists ${found.length} countries`, strong: false };
      }
    }
    return null;
  },
  "timezone-only": (job) => {
    const leftover = job.loc.replace(GEO_WORDS, "").replace(/[^A-Za-z]+/g, "");
    if (leftover !== "") return null;
    const strong = job.text.match(TZ_STRONG);
    if (strong) return { why: `timezone ${quote(strong)}, no geography in location`, strong: true };
    const weak = job.text.match(TZ_WEAK);
    return weak
      ? { why: `timezone ${quote(weak)}, no geography in location`, strong: false }
      : null;
  },
  emea: (job) => {
    if (EMEA.test(job.loc))
      return { why: `location says EMEA: "${job.loc.slice(0, 80)}"`, strong: true };
    const m = sentenceWith(job.text, EMEA, HIRING_CONTEXT);
    return m
      ? { why: "description mentions EMEA near hiring/location words", strong: false }
      : null;
  },
  "europe-region": (job) => {
    const l = job.loc.match(EUROPE_LOC);
    if (l) return { why: `location says ${quote(l)}: "${job.loc.slice(0, 80)}"`, strong: true };
    const m = job.text.match(EUROPE_TEXT);
    return m ? { why: `description ${quote(m)}`, strong: false } : null;
  },
  "latam-or-other-region": (job) => {
    const m = job.loc.match(OTHER_REGION);
    if (!m) return null;
    // Region-led locations ("Remote - LATAM") beat long country lists that happen to name a region.
    return {
      why: `location region ${quote(m)}: "${job.loc.slice(0, 80)}"`,
      strong: countCountries(job.loc).length < 3,
      variant: m[1]!.toUpperCase(),
    };
  },
  "bare-remote": (job) => {
    const parts = job.loc
      .split(";")
      .map((p) => p.trim())
      .filter(Boolean);
    return parts.length > 0 && parts.every((p) => REMOTE_ONLY.test(p))
      ? { why: `location is only "${job.loc}"`, strong: true }
      : null;
  },
  "us-only": (job) => {
    if (!US.test(job.loc)) return null;
    const remote = job.workplace_type === "remote" || /remote/i.test(job.loc);
    const others = countCountries(job.loc).filter((c) => c !== "US");
    return remote && others.length === 0
      ? { why: `remote, location US only: "${job.loc.slice(0, 80)}"`, strong: true }
      : null;
  },
  "onsite-hybrid-elsewhere": (job, targets) => {
    if (job.workplace_type !== "onsite" && job.workplace_type !== "hybrid") return null;
    if (!job.loc || /remote/i.test(job.loc)) return null;
    const loc = stripUsGeorgia(job.loc);
    if (targets.some((code) => COUNTRY_INFO[code]!.terms.test(loc))) return null;
    return { why: `${job.workplace_type} in "${job.loc.slice(0, 80)}"`, strong: true };
  },
};

// Key spans: short verbatim sentences worth reading before labeling.
const STRONG =
  /authori[sz]|work permit|right to work|eligib|visa|sponsor|citizen|based in|located in|resid|reloc|contractor|\bB2B\b|\bEOR\b|employer of record|\bDeel\b|Oyster|Remote\.com|\bEMEA\b|Europe|\bEU\b|\bEEA\b|LATAM|Latin America|APAC|worldwide|anywhere|countr(y|ies)|time ?zone|\bUTC\b|\bGMT\b|\bCET\b|\bEST\b|\bPST\b|overlap/i;
const WEAK = /\bremote\b|location|hybrid|on-?site|office/i;
const MAX_SPAN = 300;

function clip(sentence: string): string {
  if (sentence.length <= MAX_SPAN) return sentence;
  const cut = sentence.slice(0, MAX_SPAN);
  return cut.slice(0, cut.lastIndexOf(" ")).trim();
}

function keySpans(text: string, targets: string[]): string[] {
  const scored = sentencesOf(text).map((s, index) => {
    const target = targets.some((code) => COUNTRY_INFO[code]!.terms.test(stripUsGeorgia(s)));
    const score = target ? 3 : STRONG.test(s) ? 2 : WEAK.test(s) ? 1 : 0;
    return { s: clip(s), index, score };
  });
  const seen = new Set<string>();
  return scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .filter((x) => {
      if (seen.has(x.s)) return false;
      seen.add(x.s);
      return true;
    })
    .slice(0, 6)
    .sort((a, b) => a.index - b.index)
    .map((x) => x.s);
}

function locationsOf(row: JobRow): string[] {
  if (row.locations.length > 0) return row.locations;
  return (row.location_text ?? "")
    .split(";")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Deterministic FNV-1a hash so a string seed still gives a reproducible numeric seed. */
function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Job ids and companies already used in labels or in existing candidate sessions 1 and 2. */
async function loadExcludedIds(
  outDir: string,
): Promise<{ ids: Set<string>; companies: Set<string> }> {
  const ids = new Set<string>();
  const companies = new Set<string>();
  const labelsDir = path.join(EVAL_DIR, "labels");
  const labelFiles = await readdir(labelsDir).catch(() => [] as string[]);
  for (const name of labelFiles.filter((f) => f.endsWith(".json"))) {
    const data = (await readJson(path.join(labelsDir, name))) as {
      jobId: string;
      snapshot: { company: string };
    };
    ids.add(data.jobId);
    companies.add(data.snapshot.company);
  }
  for (const n of [1, 2]) {
    const file = path.join(outDir, `session-${n}.json`);
    const data = (await readJson(file).catch(() => null)) as CandidatesFile | null;
    if (!data) continue;
    for (const c of data.candidates) {
      ids.add(c.jobId);
      companies.add(c.snapshot.company);
    }
  }
  return { ids, companies };
}

async function loadJobs(): Promise<Job[]> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (run through scripts/dev-staging.sh)");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const { rows } = await client.query<JobRow>(`
      SELECT j.id, j.url, j.source, j.title, j.location_text, j.locations, j.workplace_type,
             j.employment_type, j.raw_text, c.name AS company, c.slug AS company_slug
      FROM jobs j
      JOIN companies c ON c.id = j.company_id
      WHERE j.status = 'open'
        AND NOT j.is_demo
        AND NOT c.is_demo
        AND j.duplicate_of_job_id IS NULL
        AND length(j.raw_text) >= 300
      ORDER BY j.id`);
    await client.query("COMMIT");
    return rows.map((row) => ({
      ...row,
      loc: locationsOf(row).join("; "),
      text: row.raw_text,
    }));
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  const { flags } = parseArgs(process.argv.slice(2));
  const targets = parseCountries(stringFlag(flags, "countries"));
  // `--count` is the current name; `--total` still works for anything still calling it that.
  const total = Number(stringFlag(flags, "count") ?? stringFlag(flags, "total") ?? 80);
  const seedFlag = stringFlag(flags, "seed");
  const seed =
    seedFlag === undefined || /^-?\d+$/.test(seedFlag) ? Number(seedFlag ?? 5) : hashSeed(seedFlag);
  const outDir = path.resolve(stringFlag(flags, "out-dir") ?? path.join(EVAL_DIR, "candidates"));
  const sessionFlag = stringFlag(flags, "session");
  const sessionNumbers = sessionFlag !== undefined ? [Number(sessionFlag)] : [1, 2];
  const excludeLabeled = flags["exclude-labeled"] === true;
  const random = seededRandom(seed);

  const excluded = excludeLabeled
    ? await loadExcludedIds(outDir)
    : { ids: new Set<string>(), companies: new Set<string>() };
  if (excludeLabeled) {
    console.log(
      `excluding ${excluded.ids.size} already-labeled/pulled job id(s) across ${excluded.companies.size} compan(y/ies)`,
    );
  }

  const jobs = (await loadJobs()).filter((job) => !excluded.ids.has(job.id));
  console.log(`open canonical non-demo jobs with text: ${jobs.length}`);

  // Match every job against every bucket.
  const matches = new Map<Bucket, { job: Job; why: string; strong: boolean; variant?: string }[]>();
  const matchedBuckets = new Map<string, Bucket[]>();
  for (const bucket of BUCKETS) matches.set(bucket, []);
  for (const job of shuffle(jobs, random)) {
    for (const bucket of BUCKETS) {
      const match = HEURISTICS[bucket](job, targets);
      if (!match) continue;
      matches.get(bucket)!.push({
        job,
        why: match.strong ? match.why : `${match.why} (weak match)`,
        strong: match.strong,
        variant: match.variant,
      });
      matchedBuckets.set(job.id, [...(matchedBuckets.get(job.id) ?? []), bucket]);
    }
  }

  // Targets per bucket, then round-robin picks so scarce companies spread across buckets.
  const target = new Map<Bucket, number>();
  const base = Math.floor(total / BUCKETS.length);
  for (const bucket of BUCKETS) target.set(bucket, base);
  const order = [...PRIORITY, ...BUCKETS.filter((b) => !PRIORITY.includes(b))];
  for (let i = 0; i < total - base * BUCKETS.length; i++) {
    const bucket = order[i % order.length]!;
    target.set(bucket, target.get(bucket)! + 1);
  }

  const picked = new Map<Bucket, { job: Job; why: string; strong: boolean; variant?: string }[]>();
  for (const bucket of BUCKETS) picked.set(bucket, []);
  const taken = new Set<string>();
  const perCompany = new Map<string, number>();
  const exhausted = new Set<Bucket>();

  const pickOne = (bucket: Bucket): boolean => {
    const mine = picked.get(bucket)!;
    const sourceCount = new Map<string, number>();
    const variantCount = new Map<string, number>();
    for (const p of mine) {
      sourceCount.set(p.job.source, (sourceCount.get(p.job.source) ?? 0) + 1);
      if (p.variant) variantCount.set(p.variant, (variantCount.get(p.variant) ?? 0) + 1);
    }
    let best: { job: Job; why: string; strong: boolean; variant?: string } | undefined;
    let bestScore = Infinity;
    for (const [index, m] of matches.get(bucket)!.entries()) {
      const companyUsed = perCompany.get(m.job.company_slug) ?? 0;
      // A company already represented in labels or an existing session gets at most 1 new post.
      const companyCap =
        excludeLabeled && excluded.companies.has(m.job.company) ? 1 : MAX_PER_COMPANY;
      if (taken.has(m.job.id) || companyUsed >= companyCap) continue;
      const score =
        companyUsed * 1000 +
        (m.strong ? 0 : 100) +
        (m.variant ? (variantCount.get(m.variant) ?? 0) * 20 : 0) +
        (sourceCount.get(m.job.source) ?? 0) * 10 +
        index / 1e6;
      if (score < bestScore) {
        best = m;
        bestScore = score;
      }
    }
    if (!best) return false;
    mine.push(best);
    taken.add(best.job.id);
    perCompany.set(best.job.company_slug, (perCompany.get(best.job.company_slug) ?? 0) + 1);
    return true;
  };

  const count = () => [...picked.values()].reduce((n, list) => n + list.length, 0);
  // First fill each bucket to its target, then hand leftover slots to buckets that still have posts.
  for (let round = 0; ; round++) {
    let progress = false;
    for (const bucket of BUCKETS) {
      if (exhausted.has(bucket) || picked.get(bucket)!.length >= target.get(bucket)!) continue;
      if (pickOne(bucket)) progress = true;
      else exhausted.add(bucket);
    }
    if (!progress) break;
    if (round > total) break;
  }
  for (const bucket of [...PRIORITY, ...BUCKETS]) {
    while (count() < total && !exhausted.has(bucket)) {
      if (!pickOne(bucket)) exhausted.add(bucket);
      else if (picked.get(bucket)!.length >= target.get(bucket)! + 2) break;
    }
  }

  const capturedAt = new Date().toISOString();
  const sessions = new Map<number, Candidate[]>(sessionNumbers.map((n) => [n, []]));
  let offset = 0;
  for (const bucket of BUCKETS) {
    const list = picked.get(bucket)!;
    list.forEach(({ job, why }, j) => {
      const session = sessionNumbers[(offset + j) % sessionNumbers.length]!;
      const text = scrubContacts(job.raw_text);
      sessions.get(session)!.push({
        id: `${slugify(job.company_slug, 24)}-${slugify(job.title, 40)}-${job.id.replace(/-/g, "").slice(-6)}`,
        jobId: job.id,
        url: job.url,
        source: job.source,
        snapshot: {
          title: job.title,
          company: job.company,
          locations: locationsOf(job).map(scrubContacts),
          workplaceType: job.workplace_type,
          employmentType: job.employment_type,
          descriptionText: text,
          capturedAt,
        },
        category: bucket,
        why,
        alsoMatched: (matchedBuckets.get(job.id) ?? []).filter((b) => b !== bucket),
        keySpans: keySpans(text, targets),
      });
    });
    offset += list.length;
  }

  const sessionCols = sessionNumbers.map((n) => `s${n}`.padStart(3)).join(" ");
  console.log(`\nbucket                     matched  picked ${sessionCols}`);
  for (const bucket of BUCKETS) {
    const perSession = sessionNumbers
      .map((n) => String(sessions.get(n)!.filter((c) => c.category === bucket).length).padStart(3))
      .join(" ");
    console.log(
      `${bucket.padEnd(26)} ${String(matches.get(bucket)!.length).padStart(7)}  ${String(picked.get(bucket)!.length).padStart(6)} ${perSession}`,
    );
  }
  const all = sessionNumbers.flatMap((n) => sessions.get(n)!);
  const bySource = new Map<string, number>();
  for (const c of all) bySource.set(c.source, (bySource.get(c.source) ?? 0) + 1);
  console.log(
    `\ntotal ${all.length} (${sessionNumbers.map((n) => `session ${n}: ${sessions.get(n)!.length}`).join(", ")})`,
  );
  console.log(`companies: ${new Set(all.map((c) => c.snapshot.company)).size}`);
  console.log(`sources: ${[...bySource].map(([s, n]) => `${s} ${n}`).join(", ")}`);

  for (const session of sessionNumbers) {
    const file: CandidatesFile = candidatesFileSchema.parse({
      session,
      generatedAt: capturedAt,
      seed,
      countries: targets,
      ways: [...EVAL_WAYS],
      candidates: sessions.get(session),
    });
    const out = path.join(outDir, `session-${session}.json`);
    await writeJson(out, file);
    console.log(`wrote ${path.relative(process.cwd(), out)}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
