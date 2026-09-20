// One application kit, from the entitlement question to the stored row (PLAN D9, D13, D17).
//
// This file holds the three rules the phase-09 contract names as reviewer targets, in one place so
// that they cannot drift apart:
//
//  1. **The quota comes from `entitlementsFor` and nowhere else.** Nothing here re-derives 3 and
//     nothing here reads `passes` to decide; the number is whatever that module answered.
//  2. **Never fall back to Pemby's key.** When the reader's own OpenRouter key fails — no credits,
//     revoked, undecryptable — they are told what happened and offered the choice. A silent
//     fallback would hand a free account unlimited kits on Pemby's money, because `ownKeyConnected`
//     means *a row exists*, not *a key works*.
//  3. **The model call is not inside the quota lock.** `insertKitWithinQuota` takes a `FOR UPDATE`
//     on the reader's own `profiles` row; held for the two fast statements it was written for it
//     blocks nobody, and held for the length of a streamed generation it blocks every other write
//     to that person's profile. So: check, generate, then reserve-and-record in one short
//     transaction. The check before the call is what stops a doomed generation being paid for; the
//     reservation after it is what makes the count race-proof.
//
// Nothing in this file logs. A cover letter, a CV and a profile all pass through it.

import {
  buildKitInput,
  deliveryEntitlementsFor,
  entitlementsFor,
  kitContentSchema,
  kitQuotaVerdict,
  normalizeKitContent,
  type Entitlements,
} from "@pemby/core";
import {
  AiCallError,
  AiOutputInvalidError,
  DailyCapReachedError,
  UserKeyError,
  createDailyCapGuard,
  decryptUserKey,
  paymentRequiredKindOf,
  runStreamingStructuredTask,
  type KeyClass,
} from "@pemby/ai";
import {
  countKitsThisMonth,
  createAiUsageLedger,
  getDb,
  insertKitWithinQuota,
  loadUserAiKey,
  markUserAiKeyUsed,
  selectUserAiKeyStatus,
} from "@pemby/db";
import {
  defaultsAnswered,
  loadJob,
  loadKit,
  loadPass,
  loadSubject,
  trackerStanding,
  toKitDefaults,
} from "./db";
import type { KitJobSubject, KitSubject } from "./db";
import type { KitContentView, KitError, KitPageView, KitQuotaView, KitView } from "./view";

/**
 * The pass-holder allowlist, read from the same variable and parsed the same way as the matcher and
 * the dispatcher (`DELIVER_TEST_PASS_HOLDERS`, `apps/worker/src/deliver/env.ts`).
 *
 * `testPassHolders` is required by `entitlementsFor` since phase 09 precisely so that a caller
 * cannot quietly omit it and downgrade everyone to the free plan, which is what happened to instant
 * delivery in phase 08. Reading the real variable is the point; passing `[]` to satisfy the type
 * would be that defect by hand.
 */
function testPassHolders(): string[] {
  return (process.env.DELIVER_TEST_PASS_HOLDERS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id !== "");
}

/**
 * Who pays for this generation.
 *
 * A pass is a purchase of Pemby's spend, so a pass holder is written on Pemby's key even when they
 * have their own connected: charging somebody twice for the thing they just bought is the worse of
 * the two mistakes available here. Everyone else with a connected key is written on theirs, which
 * is what connecting one means.
 */
type Payer = "pemby" | "user";

export interface KitEntitlement {
  entitlements: Entitlements;
  quota: KitQuotaView;
  payer: Payer;
  /** What `insertKitWithinQuota` is given: a number, or null for unlimited. */
  limit: number | null;
}

/**
 * The entitlement question, asked **about the key that is actually going to be spent**.
 *
 * `ownKeyConnected` is derived from `payer`, not from the key row, and that is load-bearing rather
 * than tidy. If the two were computed separately, a build could end up choosing Pemby's key while
 * telling `entitlementsFor` the reader had their own — which answers `kitQuota: "unlimited"`, which
 * becomes `limit: null`, which is a free account generating unlimited kits on Pemby's credits. One
 * decision, both consequences derived from it, so the two cannot disagree.
 */
export async function readEntitlement(
  userId: string,
  subject: KitSubject,
  now: Date,
): Promise<KitEntitlement> {
  const db = getDb();
  const [pass, keyStatus] = await Promise.all([
    loadPass(userId),
    selectUserAiKeyStatus(db, userId),
  ]);

  const base = {
    userId,
    pass,
    includeYellow: subject.includeYellow,
    now,
    testPassHolders: testPassHolders(),
  };
  const plan = deliveryEntitlementsFor(base).plan;
  const payer: Payer = plan === "pass" ? "pemby" : keyStatus ? "user" : "pemby";
  const entitlements = entitlementsFor({ ...base, ownKeyConnected: payer === "user" });

  const used = await countKitsThisMonth(db, userId, now);
  const limit = entitlements.kitQuota === "unlimited" ? null : entitlements.kitQuota;

  return {
    entitlements,
    payer,
    limit,
    quota: { limit, used, ownKey: keyStatus !== null, plan: entitlements.plan },
  };
}

// The page ----------------------------------------------------------------

/** Everything `/kit/[jobId]` renders on first paint, or null when the post is not open any more. */
export async function loadKitPage(
  userId: string,
  jobId: string,
  now: Date,
): Promise<KitPageView | null> {
  const [job, subject] = await Promise.all([loadJob(jobId), loadSubject(userId)]);
  if (!job) return null;

  // No profile row: there is no quota to report and nothing to write a kit from. The page says so
  // and points at onboarding; it does not invent a zero-of-three.
  if (!subject) {
    return {
      readAt: now.toISOString(),
      blocker: "no_profile",
      applied: false,
      canRecordApplied: false,
      job: job.view,
      kit: null,
      quota: { limit: null, used: 0, ownKey: false, plan: "free" },
      defaults: { noticePeriod: null, links: [], workAuthorization: {}, answeredAt: null },
    };
  }

  const [kit, entitlement, standing] = await Promise.all([
    loadKit(userId, jobId),
    readEntitlement(userId, subject, now),
    trackerStanding(userId, jobId),
  ]);

  return {
    readAt: now.toISOString(),
    // A kit written from a profile alone would be a cover letter about a form, so a missing CV
    // stops the page rather than degrading the output. It is still a blocker when an old kit
    // exists: that one stays readable, and a second one cannot be written.
    blocker: subject.cvText.trim() === "" ? "no_cv" : null,
    applied: standing.applicationState !== null,
    canRecordApplied: standing.canRecordApplied,
    job: job.view,
    kit,
    quota: entitlement.quota,
    defaults: subject.defaults,
  };
}

// The run -----------------------------------------------------------------

export interface KitRunPlan {
  userId: string;
  job: KitJobSubject;
  entitlement: KitEntitlement;
  keyClass: Extract<KeyClass, "private" | "user">;
  /** Present only when `keyClass` is `"user"`. Never logged, never serialized. */
  userApiKey?: string;
  /** The model input, already built. Personal data; never logged. */
  input: string;
}

export type Preflight = { ok: true; plan: KitRunPlan } | { ok: false; error: KitError };

/**
 * Everything that must be true before a model is called, in the order that spends the least.
 *
 * Every refusal here happens **before** a request leaves the building, so a person who is out of
 * quota, has no CV, or has a key that will not decrypt costs nothing to turn away. The quota is
 * checked twice on purpose: here, cheaply, to avoid paying for a generation that cannot be stored,
 * and again inside `insertKitWithinQuota`, atomically, because this check is a read with no
 * reservation and two browser tabs would both pass it.
 */
export async function planKitRun(userId: string, jobId: string, now: Date): Promise<Preflight> {
  const [job, subject] = await Promise.all([loadJob(jobId), loadSubject(userId)]);
  if (!job) return { ok: false, error: "job_not_found" };
  if (!subject) return { ok: false, error: "no_profile" };

  // A seeded demonstration person. Refused rather than filtered, because the only thing generating
  // here would achieve is spending real money writing a cover letter about somebody fictional. A
  // demo *post* is fine and carries the EXAMPLE stamp instead: it is a real model call about a real
  // person, against an invented advertisement, which is exactly what a demonstration is for.
  if (subject.demo) return { ok: false, error: "forbidden" };

  if (subject.cvText.trim() === "") return { ok: false, error: "no_cv" };
  if (!defaultsAnswered(subject.defaults)) return { ok: false, error: "defaults_missing" };

  const entitlement = await readEntitlement(userId, subject, now);
  const verdict = kitQuotaVerdict({
    entitlements: entitlement.entitlements,
    usedThisMonth: entitlement.quota.used,
  });
  if (!verdict.allowed) return { ok: false, error: "quota_exhausted" };

  let userApiKey: string | undefined;
  if (entitlement.payer === "user") {
    const stored = await loadUserAiKey(getDb(), userId);
    // The row vanished between the status read and here, or will not decrypt. Either way this is
    // not a quota problem and must not become a call on Pemby's key.
    if (!stored) return { ok: false, error: "key_unreadable" };
    try {
      userApiKey = decryptUserKey(stored.blob);
    } catch (error) {
      if (error instanceof UserKeyError) return { ok: false, error: "key_unreadable" };
      throw error;
    }
  }

  const { text } = buildKitInput({
    profile: subject.profile,
    cvText: subject.cvText,
    job: job.post,
    defaults: toKitDefaults(subject.defaults),
    screeningQuestions: job.view.screeningQuestions,
  });

  return {
    ok: true,
    plan: {
      userId,
      job,
      entitlement,
      keyClass: entitlement.payer === "user" ? "user" : "private",
      ...(userApiKey === undefined ? {} : { userApiKey }),
      input: text,
    },
  };
}

export type KitRunResult =
  { ok: true; kit: KitView; quota: KitQuotaView } | { ok: false; error: KitError };

export interface KitRunOptions {
  /** Called with each partial object the stream produces. Throttling is the caller's job. */
  onPartial: (partial: Partial<KitContentView>) => void | Promise<void>;
  /** The request's own signal: a reader who navigates away stops paying for the rest. */
  signal?: AbortSignal;
  now: Date;
}

export async function runKit(plan: KitRunPlan, options: KitRunOptions): Promise<KitRunResult> {
  const db = getDb();
  const ledger = createAiUsageLedger(db);

  let result;
  try {
    result = await runStreamingStructuredTask({
      task: "application-kit",
      schema: kitContentSchema,
      input: plan.input,
      ledger,
      // `countsTowardDailyCap` skips this entirely for a user's own key, so a reader on their own
      // credits is never held back by Pemby's $3 — but the guard is still constructed, because the
      // option is not optional and a caller that hands it a stub is a caller that will one day hand
      // a stub on the private path too.
      capGuard: createDailyCapGuard({ ledger }),
      context: { userId: plan.userId, jobId: plan.job.view.jobId },
      keyClass: plan.keyClass,
      ...(plan.userApiKey === undefined ? {} : { userApiKey: plan.userApiKey }),
      ...(options.signal === undefined ? {} : { abortSignal: options.signal }),
      onPartial: (partial) => options.onPartial(toPartialContent(partial)),
    });
  } catch (error) {
    return { ok: false, error: failureCode(error, plan.entitlement.payer) };
  }

  if (plan.entitlement.payer === "user") {
    // Fire and forget: a failed stamp must never fail the kit the reader is waiting for.
    void markUserAiKeyUsed(db, plan.userId).catch(() => undefined);
  }

  // Bounds live here, after parsing, never in the schema: a zod rejection of one over-long bullet
  // costs a paid repair retry for a cosmetic overrun (`packages/core/src/kits/schema.ts`).
  const content = normalizeKitContent(result.data);

  const inserted = await insertKitWithinQuota(
    db,
    {
      userId: plan.userId,
      jobId: plan.job.view.jobId,
      // No `match_id`. A kit is per (person, post) and nothing reads this column yet; pointing it
      // at a match row would make the kit disappear from `retireStaleMatches`'s point of view the
      // day that match is retired, for no gain.
      content,
      model: result.model,
      promptVersion: result.promptVersion,
      keyClass: result.keyClass,
      costUsd: result.costUsd.toFixed(6),
    },
    { limit: plan.entitlement.limit, now: options.now },
  );

  if (inserted.status === "no-profile") return { ok: false, error: "no_profile" };
  if (inserted.status === "quota-exhausted") {
    // The reader passed the cheap check and lost the reservation to another tab of their own. The
    // generation is paid for and thrown away, which is the price of never letting the count be
    // wrong; it costs a fraction of a cent and cannot be reached without two concurrent requests.
    return { ok: false, error: "quota_exhausted" };
  }

  return {
    ok: true,
    kit: {
      kitId: inserted.id,
      jobId: plan.job.view.jobId,
      content,
      provenance: {
        aiGenerated: true,
        model: result.model,
        promptVersion: result.promptVersion,
        keyClass: result.keyClass,
        generatedAt: options.now.toISOString(),
      },
    },
    quota: { ...plan.entitlement.quota, used: inserted.usedThisMonth },
  };
}

/**
 * A partial model reply, made safe to render.
 *
 * `onPartial` is handed whatever `parsePartialJson` made of an incomplete document, so every field
 * may be missing, half-written, or the wrong type entirely. Nothing here repairs a value; anything
 * that is not yet the right shape is simply not shown until it is.
 */
function toPartialContent(partial: unknown): Partial<KitContentView> {
  if (typeof partial !== "object" || partial === null) return {};
  const source = partial as Record<string, unknown>;
  const out: Partial<KitContentView> = {};

  if (Array.isArray(source.cvBullets)) {
    out.cvBullets = source.cvBullets.filter((b): b is string => typeof b === "string");
  }
  if (typeof source.coverLetter === "string") out.coverLetter = source.coverLetter;
  if (Array.isArray(source.screeningAnswers)) {
    out.screeningAnswers = source.screeningAnswers.flatMap((entry) => {
      if (typeof entry !== "object" || entry === null) return [];
      const { question, answer } = entry as Record<string, unknown>;
      if (typeof question !== "string") return [];
      return [{ question, answer: typeof answer === "string" ? answer : "" }];
    });
  }
  return out;
}

/**
 * Why the generation stopped, as a code the page can answer with an action.
 *
 * Branching on `paymentRequiredKindOf` rather than on message text is the contract's rule and it is
 * not stylistic: `limit_source` is the only thing that distinguishes "top up" from "wait", and only
 * `in-flight` is retryable. It is consulted **before** the `AiCallError` arm because a 402 is also
 * an `AiCallError`, and the generic arm would swallow it.
 *
 * A 402 on Pemby's own key is not the reader's problem and there is nothing they can do about it,
 * so it lands on `cap_reached` beside the daily cap — which is what it is from where they sit:
 * Pemby cannot pay right now.
 */
function failureCode(error: unknown, payer: Payer): KitError {
  if (error instanceof DailyCapReachedError) return "cap_reached";
  if (error instanceof AiOutputInvalidError) return "output_invalid";

  const payment = paymentRequiredKindOf(error);
  if (payment !== null) {
    if (payer !== "user") return "cap_reached";
    if (payment === "credits") return "key_credits";
    if (payment === "key-limit") return "key_limit";
    return "key_busy";
  }

  if (error instanceof AiCallError) {
    // A key OpenRouter refuses outright: revoked at their end, deleted, or never valid. A row in
    // `user_ai_keys` means a key exists, not that it works.
    if (payer === "user" && (error.status === 401 || error.status === 403)) return "key_invalid";
    return "model_failed";
  }

  return "unavailable";
}
