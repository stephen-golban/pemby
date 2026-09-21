import type { EligibilityTier } from "@pemby/core";
import type { NearMissBlocker } from "@/app/api/brief/_lib/view";

/**
 * The markers this page draws inside its solid accent tiles.
 *
 * A tile is never decoration: it carries the marker of the thing it stands for. An eligibility tile
 * carries its tier's own mark — a check for a post that names your country, a tilde for one that
 * only implies it, a question mark for one that says nothing — so the tile means something to a
 * reader who cannot tell green from yellow. A near-miss tile carries the mark of the gate that
 * blocked the post.
 *
 * Every mark is decorative in the accessibility tree: the tier pill and the blocker label always
 * carry the same information in words.
 */

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.4,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** The eligibility tiers, in the order the legend teaches them. */
export const LEGEND_TIERS = [
  "green",
  "yellow",
  "white",
] as const satisfies readonly EligibilityTier[];

export function TierMark({ tier, className }: { tier: EligibilityTier; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {tier === "green" ? (
        // It says your country: a check.
        <path d="M4.5 12.6 9.6 17.7 19.5 6.9" {...STROKE} />
      ) : tier === "yellow" ? (
        // It only implies your country: the "approximately" mark.
        <path d="M3.8 13.4c2.1-3.6 4.3-3.6 6.4 0s4.3 3.6 6.4 0" {...STROKE} />
      ) : tier === "white" ? (
        // It says nothing either way: a question.
        <path d="M8.9 9.1a3.1 3.1 0 1 1 3.1 3.1v2.2M12 18.3h.01" {...STROKE} />
      ) : (
        // Ruled out. Never drawn as a verdict on this page; here so the vocabulary is complete.
        <path d="M7 7l10 10M17 7 7 17" {...STROKE} />
      )}
    </svg>
  );
}

/** Which accent a blocker's tile is filled with. Red is a blocker colour and only ever that. */
export function blockerAccent(blocker: NearMissBlocker | null): "red" | "blue" | "yellow" | "ink" {
  switch (blocker) {
    case "eligibility":
    case "dealbreaker":
      return "red";
    case "way_of_working":
    case "seniority":
    case "score":
      return "blue";
    case "freshness":
    case "salary":
    case "salary_missing":
      return "yellow";
    default:
      return "ink";
  }
}

export function BlockerMark({
  blocker,
  className,
}: {
  blocker: NearMissBlocker | null;
  className?: string;
}) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {blocker === "eligibility" ? (
        // Not open where you are: a barred circle.
        <>
          <circle cx="12" cy="12" r="8.2" {...STROKE} />
          <path d="M6.2 6.2 17.8 17.8" {...STROKE} />
        </>
      ) : blocker === "way_of_working" ? (
        // The engagement, not the role: two figures.
        <>
          <circle cx="9.2" cy="8.8" r="3" {...STROKE} />
          <path d="M3.6 18.6a5.6 5.6 0 0 1 11.2 0" {...STROKE} />
          <path d="M16.2 7.2a2.6 2.6 0 0 1 0 5M17.6 18.6a5 5 0 0 0-2.1-4" {...STROKE} />
        </>
      ) : blocker === "freshness" ? (
        // Not seen live recently: a clock.
        <>
          <circle cx="12" cy="12" r="8.2" {...STROKE} />
          <path d="M12 7.4V12l3.2 2" {...STROKE} />
        </>
      ) : blocker === "seniority" ? (
        // A level away: a step up.
        <path d="M4 18.5h5v-4h5v-4h6" {...STROKE} />
      ) : blocker === "dealbreaker" ? (
        // Something you ruled out.
        <path d="M6.6 6.6 17.4 17.4M17.4 6.6 6.6 17.4" {...STROKE} />
      ) : blocker === "salary" ? (
        // Below your floor: an arrow down to a line.
        <path d="M12 4.6v10.8M7.4 11.2 12 15.8l4.6-4.6M5.4 19.4h13.2" {...STROKE} />
      ) : blocker === "salary_missing" ? (
        // Nothing listed: a blank line.
        <path d="M5.2 12h13.6" {...STROKE} />
      ) : blocker === "score" ? (
        // Close, but under the bar: a target.
        <>
          <circle cx="12" cy="12" r="8.2" {...STROKE} />
          <circle cx="12" cy="12" r="3" {...STROKE} />
        </>
      ) : (
        // Something else.
        <path d="M6 12h.01M12 12h.01M18 12h.01" {...STROKE} />
      )}
    </svg>
  );
}

/** The arrow on the Apply pill: long, and it slides on hover. */
export function ArrowMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4.5 12h14M13.4 6.8 18.6 12l-5.2 5.2" {...STROKE} />
    </svg>
  );
}
