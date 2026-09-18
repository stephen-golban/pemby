// Reason params, resolved for a channel that has no React.
//
// `GATE_REASONS`, `SCORE_REASONS` and `ENGINE_REASONS` store a key and a params object, and the
// params are *data*, not prose: `country` is a bare ISO 3166-1 alpha-2 code. The Brief never renders
// it raw — `apps/web/components/brief/reasons.ts` replaces it with a resolved name from
// `useCountryName` (`apps/web/components/profile/format.ts:8`, `Intl.DisplayNames` with a code
// fallback) — so the same template that reads "The post is yellow for Moldova" on the web would read
// "The post is yellow for MD" on Telegram if the dispatcher called `renderGateReason` straight.
//
// This module is the step the non-React channels are missing. It runs before `renderGateReason` and
// `renderScoreReason`, never instead of them: the templates stay byte-identical to their twins in
// `apps/web/messages/en/brief.json`, and the parity checker still covers them unchanged.
//
// **Resolving is not translating.** Nothing here writes a sentence or a label. `Intl.DisplayNames`
// is the platform's own region table, so a resolved country name is the same string the web gets
// from the same API, and there is no new copy for an i18n catalogue to fall out of step with.
//
// What is deliberately *not* resolved:
//
//   - `tier` — green and yellow are the product's own vocabulary and the Brief prints them raw too.
//   - `engagement` — already a phrase, not a slug: `eligibility/engine/index.ts` fills it with
//     "contractors" or "employees through an employer of record".
//   - `domains` — `scoring/score.ts` joins up to two domain names, which are already prose.
//   - `way` — `gates/evaluate.ts` fills it with `WayOfWorking` slugs (`b2b-contractor`), which *is*
//     a raw slug and does read badly. It is left alone here because turning it into "B2B contractor"
//     means writing a label table, and a label table is copy: it belongs in `brief.json` beside the
//     reasons, with a twin the parity checker can see, not invented in the delivery kernel where
//     nothing would ever compare it to the web. The Brief renders it raw today for the same reason,
//     so this is not a delivery-specific regression.

/** A bare ISO 3166-1 alpha-2 code, which is what the engine and the gates store. */
const COUNTRY_CODE = /^[A-Za-z]{2}$/;

/** `Intl.DisplayNames` is expensive to build and there is one per locale in practice. */
const regionNames = new Map<string, Intl.DisplayNames | null>();

function regionNamesFor(locale: string): Intl.DisplayNames | null {
  const cached = regionNames.get(locale);
  if (cached !== undefined) return cached;

  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames([locale], { type: "region" });
  } catch {
    names = null;
  }
  regionNames.set(locale, names);
  return names;
}

/**
 * The country's name in `locale`, or the code back.
 *
 * Never throws. An unknown-but-well-formed code comes back as itself (`Intl.DisplayNames` defaults
 * to `fallback: "code"`), and anything that is not two letters is not offered to the API at all —
 * which is what would throw. Same shape as the web helper, on purpose.
 *
 * Module-private, and `Intl.DisplayNames` rather than core's own `countryName`
 * (`eligibility/regions/countries.ts:338`), because the point is to say what the Brief says: the
 * web reads the platform's region table, so this reads the same one. Core's map is a different
 * table for a different job — recognising a code in a job post — and two exported functions of the
 * same name would invite a caller to pick the wrong one.
 */
function countryDisplayName(code: string, locale = "en"): string {
  if (!COUNTRY_CODE.test(code)) return code;
  try {
    return regionNamesFor(locale)?.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/**
 * The params a reason will be rendered with, with the data ones turned into words.
 *
 * Pure: a new object, the input untouched. Apply it to `GateReason.params` / `ScoreReason.params`
 * before handing them to `renderGateReason` / `renderScoreReason`.
 */
export function resolveReasonParams(
  params: Record<string, string>,
  locale = "en",
): Record<string, string> {
  const resolved: Record<string, string> = { ...params };
  const country = params["country"];
  if (typeof country === "string" && country !== "") {
    resolved["country"] = countryDisplayName(country, locale);
  }
  return resolved;
}
