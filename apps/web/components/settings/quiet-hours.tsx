"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import type { QuietView } from "@/app/api/channels/_lib/view";
import styles from "./channels.module.css";

/** Minutes after local midnight as the 24-hour clock an `<input type="time">` speaks. */
function toClock(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

/** The same trip back. Anything that is not `HH:MM` is not a time and is refused, not guessed. */
function toMinutes(clock: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(clock);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/*
 * Two facts about the browser, neither of which exists on the server.
 *
 * Both are read through `useSyncExternalStore` with a server snapshot of "nothing yet" — the shape
 * `push-row.tsx` uses for push support, for the same reason. Read directly they are read twice: in
 * the server's paint `Intl` answers for the *container*, and in the browser it answers for the
 * *person*. The two answers disagree, so a UTC box would paint a "use this browser's zone (UTC)"
 * button that the browser then takes away — a control that was wrong for as long as it was on
 * screen, and an element count that does not match, which React 19 resolves by throwing away the
 * server's HTML for the whole page. The zone list disagrees as well: 418 entries that move with the
 * ICU version each side was built against, and none of which belongs in the HTML of a page that
 * cannot act on any of them until it has hydrated.
 *
 * Nothing subscribes: a browser does not change its timezone database while the page is open. Both
 * reads are cached, because `getSnapshot` must return the same value every time it is called or
 * React re-renders forever.
 */

/** No source of change to listen to; `useSyncExternalStore` still wants a stable subscriber. */
const noSubscription = () => () => {};

let zoneCache: string | null | undefined;

function browserZone(): string | null {
  if (zoneCache === undefined) {
    try {
      zoneCache = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
    } catch {
      zoneCache = null;
    }
  }
  return zoneCache;
}

/** The server holds no browser zone, and says so rather than offering the container's own. */
const noZone = () => null;

const noZones: readonly string[] = [];

let zonesCache: readonly string[] | undefined;

function supportedZones(): readonly string[] {
  if (zonesCache === undefined) {
    try {
      zonesCache = [...Intl.supportedValuesOf("timeZone")];
    } catch {
      zonesCache = noZones;
    }
  }
  return zonesCache;
}

const serverZones = () => noZones;

/**
 * Quiet hours (PLAN D8): the window in the person's own local time when nothing is sent.
 *
 * One decision, so one block: the window as it stands, set large enough to read as an answer rather
 * than as a form value, and the three controls that change it directly under it. There is no edit
 * pill and no editor to open — every line on this page is a decision, and hiding three fields
 * behind a toggle would cost a tap and teach nothing.
 *
 * A start with no end and no zone is not a quiet window — `isWithinQuietHours` in `@pemby/core`
 * reads a partly-filled one as "no quiet hours", which is the opposite of what someone who has just
 * typed a start time means — so the controls hold their three values locally and commit only when
 * all three say something, and the server refuses the partial shape as well.
 *
 * A window may cross midnight; 22:00 to 07:00 is the common one. Nothing special happens here for
 * it — two ordinary minute values whose start is the greater one — and the card says in words that
 * it read them that way, so nobody has to wonder whether it wrapped.
 *
 * The window lives on the channel rows (one per channel, same values), so there is nowhere to store
 * it until a channel exists. When there is none, the controls are disabled and the card says so
 * instead of taking an edit that would be silently dropped.
 */
export function QuietHours({
  quiet,
  hasChannels,
  onChange,
}: {
  quiet: QuietView;
  hasChannels: boolean;
  onChange: (next: QuietView | null) => void;
}) {
  const t = useTranslations("Settings.quiet");
  const set = quiet.startMinute !== null && quiet.endMinute !== null && quiet.timezone !== null;

  const [start, setStart] = useState(quiet.startMinute === null ? "" : toClock(quiet.startMinute));
  const [end, setEnd] = useState(quiet.endMinute === null ? "" : toClock(quiet.endMinute));
  /**
   * The zone chosen *here*, or `undefined` while it has not been touched — which is not the same as
   * having been cleared to nothing. Untouched, the control shows the account's stored zone, and the
   * browser's own guess in its place once the browser has been read and there is none stored.
   */
  const [picked, setPicked] = useState<string | null | undefined>(undefined);

  const guess = useSyncExternalStore(noSubscription, browserZone, noZone);
  const zones = useSyncExternalStore(noSubscription, supportedZones, serverZones);
  const zone = picked === undefined ? (quiet.timezone ?? guess) : picked;

  const startId = useId();
  const endId = useId();
  const zoneId = useId();
  const clashId = useId();

  function commit(next: { start?: string; end?: string; zone?: string | null }) {
    const from = next.start ?? start;
    const until = next.end ?? end;
    const where = next.zone === undefined ? zone : next.zone;
    if (next.start !== undefined) setStart(next.start);
    if (next.end !== undefined) setEnd(next.end);
    if (next.zone !== undefined) setPicked(next.zone);

    const startMinute = toMinutes(from);
    const endMinute = toMinutes(until);
    if (startMinute === null || endMinute === null || !where) return;
    if (startMinute === endMinute) return;
    onChange({ startMinute, endMinute, timezone: where });
  }

  function clear() {
    setStart("");
    setEnd("");
    onChange(null);
  }

  const clash = start !== "" && start === end;
  const options: readonly string[] = zone && !zones.includes(zone) ? [zone, ...zones] : zones;

  return (
    <div className={styles.quiet}>
      <p className={styles.window}>
        {set ? (
          <>
            <span className={styles.windowValue}>
              {t("window", {
                from: toClock(quiet.startMinute ?? 0),
                until: toClock(quiet.endMinute ?? 0),
              })}
            </span>
            <span className={styles.windowZone}>{quiet.timezone}</span>
          </>
        ) : (
          <span className={styles.windowEmpty}>{t("none")}</span>
        )}
      </p>

      <p className={styles.help}>{hasChannels ? t("help") : t("needsChannel")}</p>

      <fieldset className={styles.fieldset} disabled={!hasChannels}>
        <legend className="visually-hidden">{t("label")}</legend>

        <span className={styles.field}>
          <label className={styles.fieldLabel} htmlFor={startId}>
            {t("from")}
          </label>
          <input
            id={startId}
            className={styles.time}
            type="time"
            value={start}
            aria-invalid={clash || undefined}
            aria-describedby={clash ? clashId : undefined}
            onChange={(event) => commit({ start: event.target.value })}
          />
        </span>

        <span className={styles.field}>
          <label className={styles.fieldLabel} htmlFor={endId}>
            {t("until")}
          </label>
          <input
            id={endId}
            className={styles.time}
            type="time"
            value={end}
            aria-invalid={clash || undefined}
            aria-describedby={clash ? clashId : undefined}
            onChange={(event) => commit({ end: event.target.value })}
          />
        </span>

        <span className={styles.field}>
          <label className={styles.fieldLabel} htmlFor={zoneId}>
            {t("zone")}
          </label>
          <select
            id={zoneId}
            className={styles.zone}
            value={zone ?? ""}
            onChange={(event) => commit({ zone: event.target.value || null })}
          >
            <option value="">{t("none")}</option>
            {options.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </span>
      </fieldset>

      {clash ? (
        <p id={clashId} className={styles.clash} role="alert">
          {t("sameTime")}
        </p>
      ) : null}

      {hasChannels && ((guess && guess !== zone) || set) ? (
        <div className={styles.quietActions}>
          {guess && guess !== zone ? (
            <button type="button" className={styles.pill} onClick={() => commit({ zone: guess })}>
              {t("useBrowserZone", { zone: guess })}
            </button>
          ) : null}
          {set ? (
            <button type="button" className={styles.pill} onClick={clear}>
              {t("clear")}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** The one line under the window that says what a wrapped one means. Shown only when it wraps. */
export function QuietWrapNote({ quiet }: { quiet: QuietView }) {
  const t = useTranslations("Settings.quiet");
  if (quiet.startMinute === null || quiet.endMinute === null) return null;
  if (quiet.startMinute <= quiet.endMinute) return null;
  return <p className={styles.footnote}>{t("wraps", { until: toClock(quiet.endMinute) })}</p>;
}
