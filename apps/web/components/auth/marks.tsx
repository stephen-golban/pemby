/**
 * The white line marks the signed-out screens draw inside their solid accent tiles.
 *
 * Every one is decorative in the accessibility tree: the statement beside it always says the same
 * thing in words, so a tile never carries meaning on its own.
 */

import type { ReactNode } from "react";

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

/** Signing in: a key. */
export function KeyMark({ className }: { className?: string }) {
  return (
    <Mark className={className}>
      <circle cx="8.4" cy="15.6" r="4.2" {...STROKE} />
      <path d="M11.4 12.6 19.4 4.6M16.6 7.4l2.2 2.2M14.4 9.6l2.2 2.2" {...STROKE} />
    </Mark>
  );
}

/** Creating an account: a person with a plus. */
export function NewAccountMark({ className }: { className?: string }) {
  return (
    <Mark className={className}>
      <circle cx="10" cy="8.4" r="3.6" {...STROKE} />
      <path d="M3.6 19.4a6.4 6.4 0 0 1 12.8 0" {...STROKE} />
      <path d="M18.4 5.6v5.2M15.8 8.2H21" {...STROKE} />
    </Mark>
  );
}

/** Anything that lives in the inbox: an envelope. */
export function MailMark({ className }: { className?: string }) {
  return (
    <Mark className={className}>
      <rect x="3.2" y="5.4" width="17.6" height="13.2" rx="2.4" {...STROKE} />
      <path d="m4.4 7.6 7.6 5.4 7.6-5.4" {...STROKE} />
    </Mark>
  );
}

/** A door that is shut: a barred circle, the same mark a blocked match carries on the Brief. */
export function BlockedMark({ className }: { className?: string }) {
  return (
    <Mark className={className}>
      <circle cx="12" cy="12" r="8.2" {...STROKE} />
      <path d="M6.2 6.2 17.8 17.8" {...STROKE} />
    </Mark>
  );
}

/** Confirmed: a check. */
export function CheckMark({ className }: { className?: string }) {
  return (
    <Mark className={className}>
      <path d="M4.5 12.6 9.6 17.7 19.5 6.9" {...STROKE} />
    </Mark>
  );
}

/** The long right arrow the world puts on a pill. */
export function ArrowMark({ className }: { className?: string }) {
  return (
    <Mark className={className}>
      <path d="M4.5 12h14M13.4 6.8 18.6 12l-5.2 5.2" {...STROKE} />
    </Mark>
  );
}
