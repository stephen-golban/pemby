// Quiet hours (PLAN D8): the window in the user's own local time during which a match is held
// rather than sent. Pure, isomorphic, explicit clock — this module never calls `Date.now()`.
//
// `Temporal` is not available in Node 24 without `--harmony-temporal` (verified on v24.18.0; it
// lands by default in Node 26), and no date library is to be added, so the only tool here is
// `Intl.DateTimeFormat`. It is used the one safe way: `formatToParts()` with `hourCycle: "h23"`,
// reading the `hour` and `minute` parts as numbers. A formatted string is never parsed — its shape
// depends on the locale, the ICU version and the zone, and "24:00" and "12 AM" are both things it
// has produced for midnight.
//
// Two things make this harder than "is the clock between these numbers".
//
// A window may cross midnight (22:00-07:00 is the common one), so "inside" is a wrap-around test,
// not a range test.
//
// And a day in a zone with daylight saving is not 1440 minutes long. Adding the minutes that
// *look* like the distance to the end of the window can land before the end (the clock went back)
// or past it (the clock went forward, possibly skipping the end minute altogether). So
// `nextReleaseAt` does not compute an answer, it converges on one: step to where the local clock
// says the window ends, look again, and repeat a bounded number of times. Every step moves
// strictly forward, and the result is clamped, so the two failure modes that matter — a release
// time in the past, and a message held for ever — are both impossible by construction.

const MINUTES_PER_DAY = 24 * 60;
const MS_PER_MINUTE = 60_000;

/**
 * The longest a message may be held, in minutes. One day plus an hour: a full wrap plus the widest
 * single DST shift in use. `nextReleaseAt` never returns anything beyond this, whatever the zone
 * does, which is the guarantee that a bad zone database or an unforeseen transition cannot turn a
 * held message into a lost one.
 */
const MAX_HOLD_MINUTES = MINUTES_PER_DAY + 60;

/** How many times `nextReleaseAt` re-reads the local clock before it accepts its answer. */
const MAX_CONVERGENCE_STEPS = 4;

/**
 * One channel's quiet window, as `channels` stores it: minutes after local midnight, plus the IANA
 * zone they are counted in.
 *
 * A null `startMinute`, `endMinute` or `timezone` means no quiet hours, and so does a window whose
 * two ends are equal — a zero-length window and a 24-hour one are the same numbers, and reading
 * them as "silence for ever" would be a setting a user could never undo from inside the product.
 */
export interface QuietWindow {
  startMinute: number | null;
  endMinute: number | null;
  /** IANA zone name, for example "Europe/Chisinau". */
  timezone: string | null;
}

/** Formatters are expensive to build and there are only as many as there are zones in use. */
const formatters = new Map<string, Intl.DateTimeFormat | null>();

/**
 * A formatter for `timezone`, or null if the runtime does not know the zone.
 *
 * Node ships full ICU, so every real IANA zone resolves; null here means the stored string is not
 * one — a typo, a zone retired between ICU versions, or a value written before the settings UI
 * constrained the field.
 */
function formatterFor(timezone: string): Intl.DateTimeFormat | null {
  const cached = formatters.get(timezone);
  if (cached !== undefined) return cached;

  let formatter: Intl.DateTimeFormat | null = null;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour12: false,
      hourCycle: "h23",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    // RangeError: unknown time zone. Cached as null so a bad row costs one failed construction.
    formatter = null;
  }
  formatters.set(timezone, formatter);
  return formatter;
}

/** Minutes after local midnight in `timezone` at `at`, or null if the zone is unknown. */
function localMinuteOfDay(timezone: string, at: Date): number | null {
  const formatter = formatterFor(timezone);
  if (formatter === null) return null;

  let hour: number | null = null;
  let minute: number | null = null;
  for (const part of formatter.formatToParts(at)) {
    if (part.type === "hour") hour = Number(part.value);
    else if (part.type === "minute") minute = Number(part.value);
  }
  if (hour === null || minute === null || !Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null;
  }
  // `hourCycle: "h23"` gives 00-23, but ICU has been known to hand back 24 for midnight under
  // other cycles; fold it rather than letting a 1440 through into the wrap arithmetic.
  return (hour % 24) * 60 + minute;
}

/** The window reduced to two numbers, or null when there is no window to apply. */
function resolve(window: QuietWindow): { start: number; end: number; timezone: string } | null {
  const { startMinute, endMinute, timezone } = window;
  if (startMinute === null || endMinute === null || timezone === null) return null;
  if (!Number.isInteger(startMinute) || !Number.isInteger(endMinute)) return null;
  if (startMinute < 0 || startMinute >= MINUTES_PER_DAY) return null;
  if (endMinute < 0 || endMinute >= MINUTES_PER_DAY) return null;
  if (startMinute === endMinute) return null;
  return { start: startMinute, end: endMinute, timezone };
}

/**
 * Inclusive of the start minute, exclusive of the end, so a 22:00-07:00 window holds a message
 * arriving at 22:00 and releases one at exactly 07:00. The wrap-around branch is the second one.
 */
function contains(minute: number, start: number, end: number): boolean {
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

/**
 * Is `at` inside this channel's quiet hours?
 *
 * False whenever the window cannot be applied: no window set, a zero-length one, or a timezone the
 * runtime does not recognise. **An unknown zone never holds a message.** The alternative — hold,
 * and work out when to release from a clock we cannot read — has no safe answer, and of the two
 * ways to be wrong, sending a match at an awkward hour is recoverable and silently swallowing it
 * is not. The dispatcher's own logs show the channel, so a bad zone surfaces as "this user's quiet
 * hours never apply" rather than as nothing at all.
 */
export function isWithinQuietHours(window: QuietWindow, at: Date): boolean {
  const resolved = resolve(window);
  if (resolved === null) return false;

  const minute = localMinuteOfDay(resolved.timezone, at);
  if (minute === null) return false;
  return contains(minute, resolved.start, resolved.end);
}

/**
 * When this message may go out: `at` itself if the window is not in force, otherwise the start of
 * the next open period.
 *
 * The result is always at or after `at`, and never more than `MAX_HOLD_MINUTES` after it.
 */
export function nextReleaseAt(window: QuietWindow, at: Date): Date {
  const resolved = resolve(window);
  if (resolved === null) return new Date(at.getTime());

  const { start, end, timezone } = resolved;
  const latest = new Date(at.getTime() + MAX_HOLD_MINUTES * MS_PER_MINUTE);

  let cursor = at;
  for (let step = 0; step < MAX_CONVERGENCE_STEPS; step++) {
    const minute = localMinuteOfDay(timezone, cursor);
    // An unknown zone releases now, for the same reason `isWithinQuietHours` returns false.
    if (minute === null) return new Date(at.getTime());
    if (!contains(minute, start, end)) return cursor > latest ? latest : new Date(cursor.getTime());

    // Minutes from here to the end of the window *as the local clock reads it now*. Never zero:
    // the end minute itself is outside the window, so the branch above has already returned.
    const delta = (end - minute + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    cursor = new Date(cursor.getTime() + delta * MS_PER_MINUTE);
    if (cursor >= latest) return latest;
  }

  // Unreachable with any real zone: one step lands on the local end minute, and a second absorbs
  // whatever a transition moved it by. The clamp is here so that "held for ever" is not a state
  // this function can express, whatever a future zone database does.
  return cursor > latest ? latest : cursor;
}
