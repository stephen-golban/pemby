/**
 * The markers this page draws inside its solid accent tiles, and the two small marks the
 * comparison table and the links use.
 *
 * A tile is never decoration. A pass tile carries the share of a year that pass buys — a ring with
 * a wedge filled to one, three or six months — so the three cards differ by shape before they
 * differ by price. A promise tile carries the mark of the thing it promises. Every mark is
 * decorative in the accessibility tree: the words beside it always carry the same information.
 */

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/**
 * A ring with a wedge filled from twelve o'clock, clockwise, for `months` of a twelve-month year.
 * Centre 12,12 and radius 7 in a 24-unit box, so it sits on the same grid as every other mark.
 */
export function SpanMark({ months, className }: { months: 1 | 3 | 6; className?: string }) {
  const angle = (months / 12) * 2 * Math.PI;
  const x = 12 + 7 * Math.sin(angle);
  const y = 12 - 7 * Math.cos(angle);
  const large = months > 6 ? 1 : 0;

  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="7" {...STROKE} />
      <path
        d={`M12 12 L12 5 A7 7 0 ${large} 1 ${x.toFixed(2)} ${y.toFixed(2)} Z`}
        fill="currentColor"
      />
    </svg>
  );
}

export type PromiseMarkKind = "guarantee" | "pause" | "refund";

export function PromiseMark({ kind, className }: { kind: PromiseMarkKind; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {kind === "guarantee" ? (
        // Days added back: a check.
        <path d="M4.5 12.6 9.6 17.7 19.5 6.9" {...STROKE} />
      ) : kind === "pause" ? (
        // The clock stops and waits: two bars.
        <path d="M9.3 5.6v12.8M14.7 5.6v12.8" {...STROKE} strokeWidth={2.8} />
      ) : (
        // The money comes back: an arrow turning anticlockwise.
        <>
          <path d="M4.8 12a7.2 7.2 0 1 0 2.4-5.4" {...STROKE} />
          <path d="M4.6 4.9v3.8h3.8" {...STROKE} />
        </>
      )}
    </svg>
  );
}

/** The long right arrow, on the black pill and on the quiet text links. */
export function ArrowMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4.5 12h14M13.4 6.8 18.6 12l-5.2 5.2" {...STROKE} />
    </svg>
  );
}

/** Free-or-pass in the comparison table: a filled tick, or an outlined dash. */
export function CellMark({ value }: { value: "yes" | "no" }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {value === "yes" ? (
        <path d="M5.4 12.4 9.9 16.9 18.6 7.4" {...STROKE} />
      ) : (
        <path d="M7 12h10" {...STROKE} />
      )}
    </svg>
  );
}

/** The plus that becomes a minus when a question opens. */
export function PlusMark({
  className,
  barClassName,
}: {
  className?: string;
  barClassName?: string;
}) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path className={barClassName} d="M12 5.4v13.2" {...STROKE} />
      <path d="M5.4 12h13.2" {...STROKE} />
    </svg>
  );
}
