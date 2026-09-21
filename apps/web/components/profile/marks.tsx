/**
 * The two glyphs this surface needs that the Brief's vocabulary does not already carry.
 *
 * Everything with a meaning the Brief already draws — the eligibility check, the "approximately"
 * tilde, the clock on something waiting, the barred circle on a blocker, the long right arrow — is
 * imported from `components/brief/marks.tsx` rather than redrawn here, so a mark cannot come to
 * mean one thing on the Brief and another on the profile. What is left is a plain tick for a step
 * that is finished (not an eligibility verdict) and a download arrow.
 *
 * Both are decorative in the accessibility tree: the words beside them always say the same thing.
 */

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.4,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** A step that is done. Deliberately not `TierMark green`: this is progress, not eligibility. */
export function StepMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 12.4 9.8 17.2 19 6.6" {...STROKE} />
    </svg>
  );
}

/** The export: a file coming down to the reader. */
export function DownloadMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 4.4v10.2M7.6 10.4 12 14.8l4.4-4.4M5 18.8h14" {...STROKE} />
    </svg>
  );
}
