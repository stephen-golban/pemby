/**
 * The marks the landing page draws inside its solid accent tiles and pills.
 *
 * A tile is never decoration: it carries the mark of the thing it stands for, so a tile still means
 * something to a reader who cannot tell green from yellow. Every mark is decorative in the
 * accessibility tree — the words beside it always carry the same information.
 *
 * Yellow is the one fill white cannot sit on (white on #FFC629 is 1.57:1), so a yellow tile always
 * takes the near-black mark that `--color-on-accent-yellow` names.
 */

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.4,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export type Mark =
  | "check"
  | "tilde"
  | "question"
  | "cross"
  | "reason"
  | "clock"
  | "briefcase"
  | "file"
  | "wallet"
  | "level"
  | "plane"
  | "send"
  | "sparkle";

function paths(mark: Mark) {
  switch (mark) {
    // It says your country: a check.
    case "check":
      return <path d="M4.5 12.6 9.6 17.7 19.5 6.9" {...STROKE} />;
    // It only implies your country: the "approximately" mark.
    case "tilde":
      return <path d="M3.8 13.4c2.1-3.6 4.3-3.6 6.4 0s4.3 3.6 6.4 0" {...STROKE} />;
    // It says nothing either way: a question.
    case "question":
      return <path d="M8.9 9.1a3.1 3.1 0 1 1 3.1 3.1v2.2M12 18.3h.01" {...STROKE} />;
    case "cross":
      return <path d="M7 7l10 10M17 7 7 17" {...STROKE} />;
    // A verdict with its reason written out: lines on a page.
    case "reason":
      return (
        <>
          <path d="M6 3.2h8.4L18.6 7.4V20.8H6z" {...STROKE} />
          <path d="M9 11.2h6.2M9 15.2h4.2" {...STROKE} />
        </>
      );
    case "clock":
      return (
        <>
          <circle cx="12" cy="12" r="8.4" {...STROKE} />
          <path d="M12 7.4V12l3.2 2.2" {...STROKE} />
        </>
      );
    case "briefcase":
      return (
        <>
          <path d="M3.6 8.6h16.8v11H3.6z" {...STROKE} />
          <path d="M9 8.6V6.2a1.6 1.6 0 0 1 1.6-1.6h2.8A1.6 1.6 0 0 1 15 6.2v2.4" {...STROKE} />
        </>
      );
    case "file":
      return (
        <>
          <path d="M6 3.2h8.4L18.6 7.4V20.8H6z" {...STROKE} />
          <path d="M14.4 3.2v4.2h4.2" {...STROKE} />
        </>
      );
    // No money named in the post.
    case "wallet":
      return (
        <>
          <path d="M3.8 7.6h16.4v11.6H3.8z" {...STROKE} />
          <path d="M3.8 7.6 15 4.8v2.8M16 13.4h.01" {...STROKE} />
        </>
      );
    // One level above you.
    case "level":
      return <path d="M5 18.6V11m7 7.6V5.4m7 13.2v-5.2" {...STROKE} />;
    case "plane":
      return <path d="M20.4 3.6 3.6 10.4l6.2 2.6 2.6 6.2z" {...STROKE} />;
    case "send":
      return <path d="M4 12h13.4M12.4 6.8 17.8 12l-5.4 5.2" {...STROKE} />;
    case "sparkle":
      return <path d="M12 4.2 13.9 10l5.9 2-5.9 2-1.9 5.8L10.1 14l-5.9-2 5.9-2z" {...STROKE} />;
  }
}

export function TileMark({ mark, className }: { mark: Mark; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {paths(mark)}
    </svg>
  );
}

/** The long right arrow the outlined pill and the quiet links carry. */
export function LongArrow({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 16" aria-hidden="true" focusable="false">
      <path
        d="M2 8h34m-6.4-5.6L35.6 8l-6 5.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
