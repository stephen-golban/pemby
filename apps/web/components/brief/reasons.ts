"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";
import type { EligibilityReasonView, ScoreReasonView } from "@/app/api/brief/_lib/view";
import { useCountryName } from "@/components/profile";
// The bar itself, not a copy of it: `FRESHNESS_HOURS` is what the hard gate is decided on and what
// the Brief's read re-applies, so the sentence that reports it reads the same constant (PLAN D6).
import { FRESHNESS_HOURS } from "@pemby/core";
import type { ProgramReason } from "@pemby/core/programs";

function hoursSince(iso: string, now: number): number {
  return Math.max(0, Math.round((now - Date.parse(iso)) / 3_600_000));
}

/**
 * Reason keys rendered through i18n.
 *
 * The keys come from `@pemby/core` — `ENGINE_REASONS`, `GATE_REASONS`, `PROGRAM_REASONS` — and
 * `messages/en/brief.json` holds the same keys with the same `{param}` placeholders, so a reason
 * translates without any string ever being built in TypeScript.
 *
 * The eligibility reason is the one a match leads with: it is the well-written line, and it is the
 * whole point of the tier. `job_eligibility.reason_key` is null on every row written before
 * migration 0008, so `text` — the English the engine already rendered into `reason` — is the
 * fallback, and today it is the usual path. A reader never sees an empty reason either way.
 */
/** A bare ISO 3166-1 alpha-2 code, which is what core puts in a program's `country` param. */
const COUNTRY_CODE = /^[A-Z]{2}$/;

/**
 * Every placeholder any `scoreReasons.*` message uses, blank.
 *
 * The matcher fills each key's own params, so these are never the value a reader sees; they are
 * here so that a row written by an older matcher, or a message edited to name a new placeholder,
 * degrades to a missing word instead of an interpolation error in place of the whole bullet.
 */
const SCORE_PARAMS: Record<string, string> = {
  skills: "",
  matched: "",
  total: "",
  domains: "",
  hours: "",
  required: "",
  years: "",
  userYears: "",
  jobSeniority: "",
  userSeniority: "",
};

export function useReasonText() {
  const t = useTranslations("Brief");
  const countryName = useCountryName();
  return useMemo(
    () => ({
      eligibility(view: EligibilityReasonView, country: string): string | null {
        if (view.key === null) return view.text;
        // `country` is the reader's own country name; the engine stores a code in some params.
        return t(`eligibilityReasons.${view.key}`, { engagement: "", ...view.params, country });
      },

      /**
       * One reason bullet, or the gap, from the score (PLAN D6). Keys and params are what the
       * matcher stores since migration 0009; `text` is the English it also stores, which is all a
       * row written before that has. Null when a row has neither, so the caller can drop it.
       */
      score(view: ScoreReasonView): string | null {
        if (view.key === null) return view.text;
        return t(`scoreReasons.${view.key}`, { ...SCORE_PARAMS, ...view.params });
      },

      /**
       * "Seen live on the company's own board 3h ago" — the `freshness` gate's own words, which is
       * the second mechanism the product is positioned on. A post older than the bar says so
       * plainly rather than rounding in Pemby's favour.
       */
      freshness(lastVerifiedLiveAt: string | null, now: number): string {
        if (lastVerifiedLiveAt === null) return t("gateReasons.freshness-never");
        const hours = hoursSince(lastVerifiedLiveAt, now);
        return hours <= FRESHNESS_HOURS
          ? t("gateReasons.freshness-ok", { hours: String(hours) })
          : t("gateReasons.freshness-stale", {
              hours: String(hours),
              limit: String(FRESHNESS_HOURS),
            });
      },

      /**
       * A programs-calendar line. Core stores the country as a bare ISO code (`programs/next-steps`
       * upper-cases it into the stipend params), so it is turned back into a name here rather than
       * letting a reader meet "Stipend for MD".
       */
      program(reason: ProgramReason): string {
        const code = reason.params.country;
        const params: Record<string, string> =
          code !== undefined && COUNTRY_CODE.test(code)
            ? { ...reason.params, country: countryName(code) ?? code }
            : reason.params;
        return t(`programReasons.${reason.key}`, params);
      },
    }),
    [t, countryName],
  );
}
