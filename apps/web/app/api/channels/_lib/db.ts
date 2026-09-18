// Database side of `/api/channels/*`.
//
// ============================================================================================
// HOW A WEB ROUTE REACHES THE DELIVERY KERNEL
// ============================================================================================
//
// The rest of `apps/web` talks to Postgres in raw SQL on `getDb().$client` and says why at the top
// of `app/api/brief/_lib/db.ts`: web cannot write Drizzle queries, because `drizzle-orm` is not one
// of its dependencies and `import { eq } from "drizzle-orm"` does not resolve here at all.
//
// That bars web from *writing* a query. It does not bar web from *calling* one that `@pemby/db`
// already exports: those helpers take `Db`, a type that resolves through `packages/db`'s own
// dependency, and `getDb()` returns exactly that object. Verified by compiling it, not assumed —
// `tsc --noEmit` accepts `mintTelegramLinkToken(getDb(), …)` in this package, and the workspace now
// resolves a single `drizzle-orm@0.45.2` for everyone.
//
// So this module splits along the line that matters rather than along the habit:
//
//   - **The deep-link token goes through the kernel** (`mintTelegramLinkToken`). It is a
//     credential. Its entropy, its base64url encoding, the SHA-256 that is all the database ever
//     sees, the retirement of the user's outstanding links and the single-statement redemption in
//     `consumeTelegramLinkToken` are one design, and the bot redeems what this mints. A second
//     implementation of half of it in raw SQL would be a second place for that design to drift,
//     and the failure mode of a drifted token is silent: a link that binds nothing, or one that
//     stays valid after it should not.
//   - **Ordinary channel rows are raw SQL here**, like every other `_lib/db.ts` in this app. The
//     kernel deliberately has no CRUD for them — it reads channels to deliver, it does not own the
//     settings page — and adding some would put a surface's shape into a package the dispatcher
//     shares.
//
// Table and column names are the ones in `packages/db/src/schema/delivery.ts` and
// `packages/db/src/schema/profiles.ts`.
//
// Personal data rule: a Telegram chat id, an email address and a push endpoint are all personal
// data. None of them is logged here, and none is returned to the browser except the caller's own
// email, which they typed in themselves.

import { createHash } from "node:crypto";
import { getDb, mintTelegramLinkToken, setDeliveryPaused, LINK_TOKEN_TTL_MS } from "@pemby/db";
import type { ChannelDeadReason, ChannelSettingsView, ChannelView, QuietView } from "./view";

/** Row shape of every channel read below. `type` is cast to text; node-postgres has no enum OID. */
interface ChannelRow {
  type: "telegram" | "email" | "push";
  address: string;
  enabled: boolean;
  dead_reason: ChannelDeadReason | null;
  dead_at: Date | null;
  created_at: Date;
  quiet_start_minute: number | null;
  quiet_end_minute: number | null;
  timezone: string | null;
}

const CHANNEL_COLUMNS = `type::text as type, address, enabled, dead_reason, dead_at, created_at,
                         quiet_start_minute, quiet_end_minute, timezone`;

/**
 * A push endpoint, reduced to something safe to hand a browser.
 *
 * The first 16 hex of the SHA-256: enough for the page to recognise the endpoint it is already
 * holding, not enough to reconstruct one it is not. The endpoint itself never leaves the server —
 * it is a bearer URL, and a page that received a list of them would be one XSS away from leaking
 * every browser the account can be pushed to.
 *
 * Shared with the client through `pushFingerprint` in `app/settings/_shared/push.ts`, which
 * computes the same value over `crypto.subtle`. The two must stay the same function; a mismatch
 * shows up at once as a push row the page says is not this browser's.
 */
export function pushFingerprint(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex").slice(0, 16);
}

function empty(): ChannelView {
  return { configured: false, enabled: false, address: null, dead: null, since: null };
}

/**
 * Fold the rows of one channel type into the one line the ledger shows.
 *
 * Telegram and email have at most one row each in practice; push has one per browser. A type is
 * "on" when any live row of it is on, which is the same question the dispatcher asks
 * (`selectDeliverableChannels`), and "dead" only when every row is — one blocked browser does not
 * make push broken.
 */
function fold(rows: ChannelRow[], withAddress: boolean): ChannelView {
  if (rows.length === 0) return empty();
  const live = rows.filter((row) => row.dead_at === null);
  const oldest = rows.reduce((a, b) => (a.created_at <= b.created_at ? a : b));
  return {
    configured: true,
    enabled: live.some((row) => row.enabled),
    address: withAddress ? (rows[0]?.address ?? null) : null,
    dead: live.length === 0 ? (rows[0]?.dead_reason ?? "permanent-failure") : null,
    since: oldest.created_at.toISOString(),
  };
}

/** Everything `/settings` shows, in two round trips. */
export async function loadChannelSettings(userId: string): Promise<ChannelSettingsView> {
  const client = getDb().$client;
  const [channels, profile] = await Promise.all([
    client.query<ChannelRow>(
      `select ${CHANNEL_COLUMNS} from channels where user_id = $1 order by created_at`,
      [userId],
    ),
    client.query<{ delivery_paused_at: Date | null }>(
      "select delivery_paused_at from profiles where user_id = $1",
      [userId],
    ),
  ]);

  const rows = channels.rows;
  const of = (type: ChannelRow["type"]) => rows.filter((row) => row.type === type);
  const push = of("push");

  // PLAN D8 keeps one quiet window per user; the column lives on every channel row, so any row
  // answers for all of them. The most recently created one wins a disagreement, which can only
  // happen if a row was written outside this route.
  const window = rows.at(-1);

  return {
    telegram: fold(of("telegram"), false),
    email: fold(of("email"), true),
    push: {
      ...fold(push, false),
      fingerprints: push
        .filter((row) => row.dead_at === null)
        .map((row) => pushFingerprint(row.address)),
    },
    quiet: {
      startMinute: window?.quiet_start_minute ?? null,
      endMinute: window?.quiet_end_minute ?? null,
      timezone: window?.timezone ?? null,
    },
    pausedAt: profile.rows[0]?.delivery_paused_at?.toISOString() ?? null,
    hasChannels: rows.length > 0,
  };
}

/**
 * The quiet window already on this account's channels, for a row that is about to be created.
 *
 * Without this, connecting Telegram after setting quiet hours on email would produce a channel
 * with no window: PLAN D8's "one window per user" is a fact about the person, but the storage is
 * per row, so a new row has to be told what the person already decided.
 */
async function inheritedWindow(userId: string): Promise<QuietView> {
  const { rows } = await getDb().$client.query<{
    quiet_start_minute: number | null;
    quiet_end_minute: number | null;
    timezone: string | null;
  }>(
    `select quiet_start_minute, quiet_end_minute, timezone
       from channels where user_id = $1 order by created_at desc limit 1`,
    [userId],
  );
  const row = rows[0];
  return {
    startMinute: row?.quiet_start_minute ?? null,
    endMinute: row?.quiet_end_minute ?? null,
    timezone: row?.timezone ?? null,
  };
}

/**
 * Switch a channel type on or off.
 *
 * Turning a channel **on** also clears the system's `dead_at` verdict, because on this surface
 * that switch is the act of reconnecting: someone whose address hard-bounced fixes the mailbox and
 * turns it back on, and leaving the verdict in place would mean the dispatcher kept skipping a
 * channel the user believes is live. Turning it **off** leaves `dead_at` alone — the user's switch
 * and the system's verdict stay two separate facts (`packages/db/src/schema/delivery.ts`).
 *
 * Email is the one type that may be created here: there is nothing to link, the address is the one
 * the account already signed in with, and refusing to store it would make "email on" a switch with
 * nothing behind it. Telegram and push have to exist first — a chat has to be bound, a browser has
 * to have produced a subscription — so for them this updates rows and creates none.
 */
export async function setChannelEnabled(
  userId: string,
  type: "telegram" | "email",
  enabled: boolean,
  emailAddress: string | null,
): Promise<void> {
  const client = getDb().$client;
  const updated = await client.query(
    // `$3::boolean`, `$2::channel_type` and `$4::text` are spelled out rather than inferred: a
    // bound parameter that appears only inside a `case` has no column to take its type from (the
    // fourth raw-SQL trap in `packages/db/src/queries/matching.ts`).
    //
    // Switching email on also re-points the row at the address the account signs in with. The row
    // duplicates `user.email`, and nothing kept the copy in step, so an account whose email changed
    // would go on being written to at the old mailbox for ever. The `not exists` guard is there
    // because `channels_type_address_uq` is global: if the new address is already some other
    // account's row, this moves nothing and the old address stands. That is the safe direction to
    // fail — the stale address is a mailbox this person had verified themselves, and the
    // alternative is a route that can point one account's delivery at another account's row.
    `update channels
        set enabled = $3::boolean,
            address = case
              when $3::boolean and $4::text is not null and not exists (
                select 1 from channels other
                 where other.type = 'email' and other.address = $4::text and other.user_id <> $1
              ) then $4::text
              else address
            end,
            dead_at = case when $3::boolean then null else dead_at end,
            dead_reason = case when $3::boolean then null else dead_reason end,
            updated_at = now()
      where user_id = $1 and type = $2::channel_type`,
    [userId, type, enabled, type === "email" ? emailAddress : null],
  );
  if (updated.rowCount !== 0 || type !== "email" || !enabled || !emailAddress) return;

  const quiet = await inheritedWindow(userId);
  // `on conflict do nothing` rather than a second read: `channels_type_address_uq` is global, so
  // the address may already belong to another account, and this route must not move it.
  await client.query(
    `insert into channels
       (user_id, type, address, enabled, verified_at, quiet_start_minute, quiet_end_minute, timezone)
     values ($1, 'email', $2, true, now(), $3, $4, $5)
     on conflict (type, address) do nothing`,
    [userId, emailAddress, quiet.startMinute, quiet.endMinute, quiet.timezone],
  );
}

/**
 * Write one quiet window to every channel the user has.
 *
 * PLAN D8 is per user; the storage is per row; one statement is the transaction. Windows that
 * cross midnight need nothing special here — a wrap is two ordinary minute values whose start is
 * greater than its end, and `isWithinQuietHours` in `@pemby/core` is what reads them that way.
 *
 * **Clearing the window leaves the zone.** `coalesce($4, timezone)` keeps it, which is what the
 * bot's `/quiet off` already does and says why (`apps/bot/src/store-db.ts:216-218`): the zone is a
 * fact about the person, not about the window, and the dispatcher reads it for more than quiet
 * hours. Two surfaces writing opposite rules into one column is how a column stops meaning
 * anything.
 *
 * It also keeps the pair honest in the safe direction. Minutes with a null zone is the one shape
 * that fails *unsafely* — `isWithinQuietHours` reads it as "no quiet hours" and the message goes
 * out at 3am instead of being held — and nothing here can produce it: `parseQuiet` refuses a
 * partial window, and a clear nulls both minutes together.
 */
export async function setQuietHours(userId: string, quiet: QuietView | null): Promise<void> {
  await getDb().$client.query(
    `update channels
        set quiet_start_minute = $2,
            quiet_end_minute = $3,
            timezone = coalesce($4::text, timezone),
            updated_at = now()
      where user_id = $1`,
    [userId, quiet?.startMinute ?? null, quiet?.endMinute ?? null, quiet?.timezone ?? null],
  );
}

/**
 * Hold or release delivery on every channel at once (`profiles.delivery_paused_at`, PLAN D8).
 *
 * Through the kernel, not raw SQL: the bot's `/pause` and `/resume` write this same column through
 * the same function, and a pause that two surfaces spell two ways is a pause that can end up
 * meaning two things.
 *
 * The row is created first if it is not there. `delivery_paused_at` lives on `profiles`, and an
 * account that signed up but has not been through onboarding has no `profiles` row yet, so the
 * kernel's `update ... where user_id = $1` would match nothing and the switch would go back to
 * "not held" on the next refetch with no explanation. Same guard, same statement, as
 * `patchProfile` in `app/api/profile/_lib/db.ts`.
 */
export async function pauseDelivery(userId: string, paused: boolean): Promise<void> {
  await getDb().$client.query(
    `insert into profiles (user_id) select $1 where exists (select 1 from "user" where id = $1)
     on conflict (user_id) do nothing`,
    [userId],
  );
  await setDeliveryPaused(getDb(), { userId, pausedAt: paused ? new Date() : null });
}

/** Telegram's `start` payload is capped at 64 characters, bot username included nowhere in it. */
const START_PAYLOAD_MAX = 64;
const BOT_USERNAME = /^[A-Za-z0-9_]{5,32}$/;

/**
 * Mint a one-time deep link, `https://t.me/<bot>?start=<token>`.
 *
 * The token comes from the kernel and is 32 random bytes in base64url — 43 characters, which the
 * assertion below holds to Telegram's 64-character limit rather than trusting the arithmetic. It
 * is returned once and is not recoverable: only its SHA-256 is stored, minting retires the
 * account's outstanding links, and the bot's `consumeTelegramLinkToken` spends it in a single
 * conditional update. Nothing about it is logged.
 *
 * Null means the bot username is not configured, which is a deployment fact, not a user error.
 */
export async function mintTelegramDeepLink(
  userId: string,
): Promise<{ url: string; expiresAt: Date } | null> {
  const bot = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "") ?? "";
  if (!BOT_USERNAME.test(bot)) return null;

  const minted = await mintTelegramLinkToken(getDb(), { userId, now: new Date() });
  if (minted.token.length > START_PAYLOAD_MAX) {
    throw new Error("telegram start payload exceeds 64 characters");
  }
  return { url: `https://t.me/${bot}?start=${minted.token}`, expiresAt: minted.expiresAt };
}

export { LINK_TOKEN_TTL_MS };

/**
 * Unlink Telegram: the row goes, rather than being switched off.
 *
 * Disconnect has to mean the bound chat is forgotten. Leaving a disabled row behind would keep the
 * chat id — personal data with no purpose left — and would make the next connect collide with
 * `channels_type_address_uq` if the same chat came back on a different account.
 */
export async function disconnectTelegram(userId: string): Promise<void> {
  await getDb().$client.query("delete from channels where user_id = $1 and type = 'telegram'", [
    userId,
  ]);
}

/**
/**
 * Store, or refresh, one browser's push subscription. Returns false when the endpoint belongs to a
 * different account.
 *
 * Two things make this an upsert rather than an insert. A browser rotates an endpoint whenever the
 * push service asks it to, and `pushManager.subscribe()` on an existing registration hands back
 * the *same* endpoint, so re-subscribing is the common case, not the exception.
 *
 * **The conflict never changes `user_id`.** It used to, on the reasoning that the browser belongs
 * to whoever is signed in on it now. That reasoning was wrong, twice over. A
 * `PushSubscription` is a fact about a browser and an origin with no account in it, so it survives
 * a sign-out: the next person to sign in on a shared machine is handed the previous one's
 * subscription by the platform, and a route that reassigns on sight moves the row without either
 * of them doing anything. And an endpoint is a string. Anyone who obtains someone else's could
 * post it with keys of their own and silently take the channel over.
 *
 * So the `do update` is guarded by `channels.user_id = excluded.user_id`: a conflicting row that
 * belongs to somebody else matches nothing, `returning` comes back empty, and the caller is told
 * to subscribe afresh instead. That is not a dead end — `unsubscribe()` followed by `subscribe()`
 * mints a **new** endpoint, which inserts cleanly, and the abandoned one starts answering 410 so
 * the dispatcher marks the old row `push-expired` on its own. The browser ends up owned by the
 * person sitting at it, without this route ever having to decide that on their behalf.
 *
 * The quiet window comes with it, for the same reason a new email row inherits one.
 */
export async function upsertPushChannel(
  userId: string,
  endpoint: string,
  keys: { p256dh: string; auth: string },
): Promise<boolean> {
  const quiet = await inheritedWindow(userId);
  const { rows } = await getDb().$client.query<{ id: string }>(
    `insert into channels
       (user_id, type, address, push_keys, enabled, verified_at,
        quiet_start_minute, quiet_end_minute, timezone)
     values ($1, 'push', $2, $3::jsonb, true, now(), $4, $5, $6)
     on conflict (type, address) do update
        set push_keys = excluded.push_keys,
            enabled = true,
            dead_at = null,
            dead_reason = null,
            verified_at = now(),
            quiet_start_minute = excluded.quiet_start_minute,
            quiet_end_minute = excluded.quiet_end_minute,
            timezone = excluded.timezone,
            updated_at = now()
      where channels.user_id = excluded.user_id
     returning id`,
    [userId, endpoint, JSON.stringify(keys), quiet.startMinute, quiet.endMinute, quiet.timezone],
  );
  return rows.length > 0;
}

/**
 * Forget push subscriptions: one browser by endpoint, or every browser **except** one.
 *
 * "Every except one" rather than "every" because the only action the page offers is "forget the
 * others", and the switch beside it is what turns this browser off. A delete that also took the
 * caller's own row would make the label a lie and leave the page claiming push was on here while
 * nothing was stored — which is exactly what it used to do.
 *
 * `keep` null means there is no "this browser" to spare: the caller holds no subscription, so
 * every row on the account is one of the others.
 *
 * Scoped by `user_id` as well as by endpoint, so a caller holding someone else's endpoint string
 * deletes nothing.
 */
export async function deletePushChannels(
  userId: string,
  target: { endpoint: string } | { keep: string | null },
): Promise<void> {
  const client = getDb().$client;
  if ("endpoint" in target) {
    await client.query(
      "delete from channels where user_id = $1 and type = 'push' and address = $2",
      [userId, target.endpoint],
    );
    return;
  }
  await client.query(
    `delete from channels
      where user_id = $1 and type = 'push' and ($2::text is null or address <> $2)`,
    [userId, target.keep],
  );
}
