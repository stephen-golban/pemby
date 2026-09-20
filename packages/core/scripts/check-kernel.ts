// Runs phase 09's core kernel for real and prints what it answered: entitlements, the kit quota
// boundary, the kit content bounds, the model input builder and the tracker mapping.
// Usage: pnpm --filter @pemby/core check:kernel
//
// This is not a test suite and there is no test runner (PLAN D24). It is the "real run" half of the
// proof: typecheck says the types agree, and this says the functions answer what they are supposed
// to answer, by importing the real modules and calling them. Every line it prints is an output the
// product depends on, so a reader can check the answers rather than trust a green tick.
//
// **What this does NOT cover, which matters more than what it does.** It runs no network, no model
// and — the important one — **no database**. It calls pure functions in `@pemby/core` with inputs
// written by hand, so:
//
//   - Every SQL string in `packages/db/src/queries/**` is untouched by this and by every other
//     gate: `tsc` typechecks a `sql` template's *type*, never its contents, so a query can be
//     syntactically wrong, join the wrong table or miss `profiles.is_demo = false` and still pass
//     typecheck, lint and build. Nothing here says otherwise.
//   - `usedThisMonth` below is a literal. That the real count comes from `kits` rows per user per
//     calendar month — not from `ai_usage` attempts, and with the month boundary in the right time
//     zone — is a database question this script cannot ask.
//   - The tracker mapping is exercised over every enum value, but that the query feeding it returns
//     the right rows is, again, SQL.
//
// So a green run here means the domain logic answers correctly, not that the feature works.
import {
  FREE_KIT_QUOTA_PER_MONTH,
  TRACKER_APPLICATION_STATES,
  TRACKER_COLUMN_LABELS,
  TRACKER_COLUMNS,
  TRACKER_MATCH_STATES,
  allowedTiersFor,
  buildKitInput,
  deliverAfter,
  deliveryEntitlementsFor,
  entitlementsFor,
  kitContentSchema,
  kitQuotaVerdict,
  normalizeKitContent,
  trackerColumnOf,
  type Entitlements,
  type KitContent,
} from "../src";

let failed = false;
function check(label: string, ok: boolean): void {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) failed = true;
}

const NOW = new Date("2026-09-19T12:00:00.000Z");
const HOLDER = "user-with-pass";
const PLAIN = "user-free";

// ---- Entitlements ---------------------------------------------------------------------------

console.log("\n-- entitlements --");

const free = entitlementsFor({
  userId: PLAIN,
  pass: null,
  includeYellow: false,
  now: NOW,
  testPassHolders: [HOLDER],
  ownKeyConnected: false,
});
check(
  `free: plan=${free.plan} delivery=${free.deliveryMode} quota=${free.kitQuota} tiers=${free.allowedTiers.join("+")}`,
  free.plan === "free" &&
    free.deliveryMode === "delayed-24h" &&
    free.kitQuota === FREE_KIT_QUOTA_PER_MONTH &&
    free.allowedTiers.join("+") === "green",
);

const holder = entitlementsFor({
  userId: HOLDER,
  pass: null,
  includeYellow: true,
  now: NOW,
  testPassHolders: [HOLDER],
  ownKeyConnected: false,
});
check(
  `test pass holder: plan=${holder.plan} delivery=${holder.deliveryMode} quota=${holder.kitQuota} tiers=${holder.allowedTiers.join("+")}`,
  holder.plan === "pass" &&
    holder.deliveryMode === "instant" &&
    holder.kitQuota === "unlimited" &&
    holder.allowedTiers.join("+") === "green+yellow",
);

const ownKey = entitlementsFor({
  userId: PLAIN,
  pass: null,
  includeYellow: false,
  now: NOW,
  testPassHolders: [HOLDER],
  ownKeyConnected: true,
});
check(
  `own key on a free plan: plan=${ownKey.plan} delivery=${ownKey.deliveryMode} quota=${ownKey.kitQuota}`,
  // The documented interaction: their credits pay for kits, so the quota lifts; it is not a
  // purchase, so the plan and the 24h delay do not move.
  ownKey.plan === "free" &&
    ownKey.deliveryMode === "delayed-24h" &&
    ownKey.kitQuota === "unlimited",
);

const delivery = deliveryEntitlementsFor({
  userId: HOLDER,
  pass: null,
  includeYellow: false,
  now: NOW,
  testPassHolders: [HOLDER],
});
check(
  `deliveryEntitlementsFor has no kitQuota field: keys=${Object.keys(delivery).sort().join(",")}`,
  !Object.hasOwn(delivery, "kitQuota") && delivery.deliveryMode === "instant",
);

const firstSeen = new Date("2026-09-19T06:00:00.000Z");
const instantAt = deliverAfter(holder, firstSeen, NOW);
const delayedAt = deliverAfter(free, firstSeen, NOW);
check(
  `deliverAfter: pass=${instantAt.toISOString()} free=${delayedAt.toISOString()} (first seen ${firstSeen.toISOString()})`,
  instantAt.getTime() === NOW.getTime() &&
    delayedAt.getTime() === firstSeen.getTime() + 24 * 3_600_000,
);

check(
  `allowedTiersFor: off=${allowedTiersFor({ includeYellow: false }).join("+")} on=${allowedTiersFor({ includeYellow: true }).join("+")}`,
  allowedTiersFor({ includeYellow: false }).join("+") === "green" &&
    allowedTiersFor({ includeYellow: true }).join("+") === "green+yellow",
);

// ---- Kit quota, across the boundary -----------------------------------------------------------

console.log("\n-- kit quota (free quota is 3 a calendar month) --");

const verdicts = (entitlements: Entitlements) =>
  [2, 3, 4].map((usedThisMonth) => {
    const verdict = kitQuotaVerdict({ entitlements, usedThisMonth });
    return `${usedThisMonth}:${verdict.allowed ? "allow" : `block(${verdict.reason}/${verdict.choice})`}`;
  });

const freeVerdicts = verdicts(free);
check(
  `free used 2/3/4 -> ${freeVerdicts.join(" ")}`,
  freeVerdicts.join(" ") ===
    "2:allow 3:block(quota/pass-or-connect) 4:block(quota/pass-or-connect)",
);

const holderVerdicts = verdicts(holder);
check(
  `pass holder used 2/3/4 -> ${holderVerdicts.join(" ")}`,
  holderVerdicts.join(" ") === "2:allow 3:allow 4:allow",
);

const ownKeyVerdicts = verdicts(ownKey);
check(
  `own key connected used 2/3/4 -> ${ownKeyVerdicts.join(" ")}`,
  ownKeyVerdicts.join(" ") === "2:allow 3:allow 4:allow",
);

const broken = kitQuotaVerdict({ entitlements: free, usedThisMonth: Number.NaN });
check(`a count that is NaN fails closed: ${broken.allowed ? "allow" : "block"}`, !broken.allowed);

// ---- Kit content: the schema parses, the bounds are applied afterwards --------------------------

console.log("\n-- kit content --");

const modelReply: unknown = {
  cvBullets: ["Shipped a payments service", "  ", "Cut p95 latency by 40%"],
  coverLetter: "Dear hiring team,\n\nI build payment systems.\n\nThank you.",
  screeningAnswers: [{ question: "Notice period?", answer: "30 days" }],
};
const parsed = kitContentSchema.safeParse(modelReply);
check(`the model reply parses: ${parsed.success ? "yes" : "no"}`, parsed.success);

if (parsed.success) {
  const normalized = normalizeKitContent(parsed.data);
  check(
    `normalize drops the blank bullet: ${parsed.data.cvBullets.length} -> ${normalized.cvBullets.length}`,
    normalized.cvBullets.length === 2,
  );
}

const absurd: KitContent = {
  cvBullets: Array.from({ length: 40 }, (_, i) => `${"x".repeat(900)} ${i}`),
  coverLetter: "y".repeat(50_000),
  screeningAnswers: Array.from({ length: 30 }, (_, i) => ({
    question: `q${i}`,
    answer: "z".repeat(9_000),
  })),
};
const bounded = normalizeKitContent(absurd);
check(
  `absurd reply is bounded: bullets ${absurd.cvBullets.length}->${bounded.cvBullets.length}, longest bullet ${Math.max(...bounded.cvBullets.map((b) => b.length))}, letter ${absurd.coverLetter.length}->${bounded.coverLetter.length}, answers ${absurd.screeningAnswers.length}->${bounded.screeningAnswers.length}`,
  bounded.cvBullets.length === 8 &&
    bounded.cvBullets.every((bullet) => bullet.length <= 300) &&
    bounded.coverLetter.length <= 3_000 &&
    bounded.screeningAnswers.length === 10 &&
    bounded.screeningAnswers.every((entry) => entry.answer.length <= 1_500),
);

// ---- The model input: ordering and the empty screening-question case ---------------------------

console.log("\n-- kit model input --");

const input = buildKitInput({
  profile: {
    titles: ["Backend engineer"],
    seniority: "senior",
    yearsExperience: 8,
    stack: ["TypeScript", "Postgres"],
    domains: ["fintech"],
    residence: "Moldova",
    waysOfWorking: ["B2B contractor", "Employee via EOR"],
    englishLevel: "C1",
  },
  cvText: "Built payment rails at a fintech.",
  defaults: {
    noticePeriod: "30 days",
    links: [{ label: "GitHub", url: "https://example.com/gh" }],
    workAuthorization: [{ question: "Do you need sponsorship?", answer: "No" }],
  },
  job: {
    title: "Senior Backend Engineer",
    company: "Example",
    locations: ["Remote (EU)"],
    workplaceType: "remote",
    employmentType: "full_time",
    stack: ["Go"],
    salaryText: null,
    descriptionText: "We are hiring a backend engineer.",
  },
  screeningQuestions: [],
});

const order = ["SECTION 1/5", "SECTION 2/5", "SECTION 3/5", "SECTION 4/5", "SECTION 5/5"].map(
  (marker) => input.text.indexOf(marker),
);
check(
  `sections are in static-to-volatile order (offsets ${order.join(", ")})`,
  order.every((offset, i) => offset >= 0 && (i === 0 || offset > (order[i - 1] ?? -1))),
);
check(
  "the person and their CV come before the job post (prompt-cache prefix)",
  input.text.indexOf("Built payment rails") < input.text.indexOf("We are hiring"),
);
check(
  "an empty screening-question list is stated, not omitted",
  input.text.includes("(the post lists no screening questions)"),
);
check(`nothing was truncated on a small input: truncated=${input.truncated}`, !input.truncated);

const big = buildKitInput({
  profile: {
    titles: [],
    seniority: null,
    yearsExperience: null,
    stack: [],
    domains: [],
    residence: null,
    waysOfWorking: [],
    englishLevel: null,
  },
  cvText: "c".repeat(25_000),
  defaults: { noticePeriod: null, links: [], workAuthorization: [] },
  job: {
    title: "T",
    company: null,
    locations: [],
    workplaceType: null,
    employmentType: null,
    stack: [],
    salaryText: null,
    descriptionText: "d".repeat(25_000),
  },
  screeningQuestions: Array.from({ length: 14 }, (_, i) => `Question ${i}`),
});
check(
  `an oversized input is cut and says so: truncated=${big.truncated}, ${big.text.includes("(CV truncated)") ? "CV marked" : "CV NOT marked"}, ${big.text.includes("(post text truncated)") ? "post marked" : "post NOT marked"}, questions kept=${(big.text.match(/^\d+\. Question/gm) ?? []).length}`,
  big.truncated &&
    big.text.includes("(CV truncated)") &&
    big.text.includes("(post text truncated)") &&
    (big.text.match(/^\d+\. Question/gm) ?? []).length === 10,
);
check(
  "empty profile fields read as (none listed) / (not given), never as blank",
  big.text.includes("Titles: (none listed)") && big.text.includes("Seniority: (not given)"),
);

// ---- Tracker: every application state, both match-state cases -----------------------------------

console.log("\n-- tracker mapping --");

const byApplicationState = TRACKER_APPLICATION_STATES.map(
  (state) =>
    `${state}->${trackerColumnOf({ matchState: null, applicationState: state }) ?? "none"}`,
);
check(
  `application states: ${byApplicationState.join(" ")}`,
  byApplicationState.join(" ") ===
    "applied->applied screening->interview interviewing->interview offer->offer rejected->rejected withdrawn->none no_response->none",
);

const byMatchState = TRACKER_MATCH_STATES.map(
  (state) =>
    `${state}->${trackerColumnOf({ matchState: state, applicationState: null }) ?? "none"}`,
);
check(
  `match states with no application row: ${byMatchState.join(" ")}`,
  byMatchState.join(" ") === "new->none saved->saved applied->applied passed->none",
);

// Spelled out rather than left to the loop above, because this is the case the tracker actually
// sees. Nothing writes `applications` as of phase 09 — both "I applied" writers only update
// `matches` — so EVERY applied job is this shape, and mapping it to `null` made the board fetch
// those rows and discard them. A regression here empties the "Applied" column.
check(
  `an applied match with no application row is on the board: ${trackerColumnOf({ matchState: "applied", applicationState: null })}`,
  trackerColumnOf({ matchState: "applied", applicationState: null }) === "applied",
);

const shadowed = trackerColumnOf({ matchState: "saved", applicationState: "offer" });
check(
  `an application row wins over the match state: saved + offer -> ${shadowed}`,
  shadowed === "offer",
);
check(
  `nothing at all -> ${trackerColumnOf({ matchState: null, applicationState: null }) ?? "none"}`,
  trackerColumnOf({ matchState: null, applicationState: null }) === null,
);
check(
  `every column has a label: ${TRACKER_COLUMNS.map((c) => TRACKER_COLUMN_LABELS[c]).join(" | ")}`,
  TRACKER_COLUMNS.every((column) => TRACKER_COLUMN_LABELS[column].length > 0),
);

process.exitCode = failed ? 1 : 0;
