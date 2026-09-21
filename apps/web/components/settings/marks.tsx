import type { ReactNode } from "react";

/**
 * The marks the delivery screen draws inside its solid accent tiles.
 *
 * A tile is never decoration: it carries the mark of the channel or the decision it stands for, so
 * the row means something to a reader who cannot tell blue from green. Every mark is decorative in
 * the accessibility tree — the row's own name and state always say the same thing in words.
 */

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.4,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function Mark({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

/** Telegram: a paper plane. */
export function TelegramMark({ className }: { className?: string }) {
  return (
    <Mark className={className}>
      <path d="M20.6 4.4 3.8 11.2l5.4 2 2 5.4 3.1-4 4 3.1z" {...STROKE} />
      <path d="M9.2 13.2 20.6 4.4" {...STROKE} />
    </Mark>
  );
}

/** Email: an envelope. */
export function MailMark({ className }: { className?: string }) {
  return (
    <Mark className={className}>
      <rect x="3.2" y="5.4" width="17.6" height="13.2" rx="2.4" {...STROKE} />
      <path d="m4.4 7.6 7.6 5.4 7.6-5.4" {...STROKE} />
    </Mark>
  );
}

/** Push, which is about this browser: a bell. */
export function BellMark({ className }: { className?: string }) {
  return (
    <Mark className={className}>
      <path d="M6 10a6 6 0 0 1 12 0c0 3.4.9 5 1.8 6H4.2C5.1 15 6 13.4 6 10Z" {...STROKE} />
      <path d="M10 19.4a2.2 2.2 0 0 0 4 0" {...STROKE} />
    </Mark>
  );
}

/** Quiet hours: a clock. */
export function ClockMark({ className }: { className?: string }) {
  return (
    <Mark className={className}>
      <circle cx="12" cy="12" r="8.2" {...STROKE} />
      <path d="M12 7.4V12l3.2 2" {...STROKE} />
    </Mark>
  );
}

/** Delivery running, and the act that stops it: two bars. */
export function PauseMark({ className }: { className?: string }) {
  return (
    <Mark className={className}>
      <path d="M9.4 5.6v12.8M14.6 5.6v12.8" {...STROKE} />
    </Mark>
  );
}

/** Delivery held, and the act that starts it again: a play triangle. */
export function ResumeMark({ className }: { className?: string }) {
  return (
    <Mark className={className}>
      <path d="M8.4 5.8 18.6 12 8.4 18.2Z" {...STROKE} />
    </Mark>
  );
}
