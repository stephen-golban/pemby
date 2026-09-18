// Inline-button payloads, shared by the dispatcher (which encodes them onto a card) and the bot
// (which decodes whatever Telegram hands back). Pure and isomorphic.
//
// Telegram caps `callback_data` at **1-64 bytes**, not characters, and a card carries a match id,
// which is a 36-character UUID. `action:uuid` spelled out is already 40-odd bytes before the action
// has a name, and PLAN section 6's "Wrong details" picker is three levels deep — reason, then
// field, then a value from a fixed list — so a payload that *accumulates* the path runs out of room
// well before the picker runs out of levels.
//
// **The format does not accumulate.** Each level replaces the previous level's payload rather than
// extending it:
//
//     <version>:<code>:<match id>[:<arg>]
//        1        2         32        <=8       characters, ASCII, so also bytes
//
// and the worst case is fixed:
//
//     version            1
//     separator          1
//     action code        2   exactly two, asserted at module load
//     separator          1
//     match id          32   the UUID's hex digits, dashes dropped
//     separator          1
//     arg              <=8   `MAX_ARG_CHARS`, validated
//     ------------------------
//     total             46   bytes, against Telegram's 64
//
// Eighteen bytes spare, and — this is the part that matters — **the size does not depend on how
// many levels the picker has or how many members its enums have**. A new level is a new action
// code, not more bytes. A new `flag_reason` or `flag_field` value is a new row in `ACTION_SPECS`
// (there are 1296 two-character codes), not more bytes. The failure this avoids is a payload that
// measures exactly 64 today, ships, and breaks the first time someone adds one enum value.
//
// The alternative that was considered — drop the match id below level 1 and recover it from
// `(chat_id, message_id)` through `delivery_log.provider_message_id` — makes the payload smaller
// still, but puts a database read in the callback path and needs a new index to make it cheap. It
// buys nothing here: the budget is already independent of depth, and 46 bytes leaves room for two
// more levels than the plan has.
//
// Two rules follow from where these strings live. A button sits in the user's chat history for
// ever, so a code in `ACTION_SPECS` is never renamed or reused — a new meaning gets a new code, and
// `decodeCallbackData` returning null for a retired one is the correct outcome. And the data comes
// back off the network, from anyone who can reach the webhook, so decoding validates every part and
// returns null rather than throwing.

/** Exactly the `match_pass_reason` pg enum values (`packages/db/src/schema/enums.ts`). */
export const PASS_REASON_VALUES = [
  "location",
  "salary",
  "seniority",
  "stack",
  "company",
  "role",
  "already_applied",
  "other",
] as const;
export type PassReasonValue = (typeof PASS_REASON_VALUES)[number];

/** Exactly the `flag_reason` pg enum values (PLAN D26, section 6). */
export const FLAG_REASON_VALUES = [
  "closed_or_fake",
  "not_hiring_from_country",
  "scam",
  "wrong_details",
  "duplicate",
  "other",
] as const;
export type FlagReasonValue = (typeof FLAG_REASON_VALUES)[number];

/** Exactly the `flag_field` pg enum values: the fixed "Wrong details" picker (PLAN section 6). */
export const FLAG_FIELD_VALUES = [
  "salary",
  "seniority",
  "stack",
  "location",
  "eligibility",
] as const;
export type FlagFieldValue = (typeof FLAG_FIELD_VALUES)[number];

/**
 * Every button a card can carry. `pass` and `flag` open their pickers; the `pass-*`, `flag-*` and
 * `field-*` actions are the picked answers, and each one carries the enum value it records so the
 * bot never has to spell a pg enum itself.
 */
export const CALLBACK_ACTIONS = [
  "save",
  "unsave",
  "applied",
  "pass",
  "pass-location",
  "pass-salary",
  "pass-seniority",
  "pass-stack",
  "pass-company",
  "pass-role",
  "pass-already-applied",
  "pass-other",
  "flag",
  "flag-closed-or-fake",
  "flag-not-hiring-from-country",
  "flag-scam",
  "flag-wrong-details",
  "flag-duplicate",
  "flag-other",
  "field-salary",
  "field-seniority",
  "field-stack",
  "field-location",
  "field-eligibility",
  "back",
] as const;
export type CallbackAction = (typeof CALLBACK_ACTIONS)[number];

/**
 * Wire format version. Bumped only if the payload's shape changes; a card already in someone's
 * chat history keeps sending the version it was built with, and an unknown version decodes to null
 * rather than to a guess.
 */
const CALLBACK_VERSION = "1";

const SEPARATOR = ":";

/** Every action code is exactly this long. See the byte budget at the top of the file. */
const CODE_CHARS = 2;

/** The match id on the wire: a UUID's hex digits with the dashes dropped. */
const ID_CHARS = 32;

/**
 * The most an `arg` may carry. Eight characters of `[0-9a-z]` is 2.8 trillion values, which is more
 * than enough for "which item of a fixed list" at any picker level PLAN section 6 describes, and it
 * is what keeps the worst case at 46 bytes instead of "whatever the caller passed".
 */
export const MAX_ARG_CHARS = 8;

/** Telegram's own limit on `callback_data`, in bytes (Bot API 10.3: 1-64). */
export const CALLBACK_DATA_MAX_BYTES = 64;

/**
 * The longest payload this module can produce. Asserted against Telegram's limit at module load, so
 * widening `MAX_ARG_CHARS` or the id past the budget fails immediately rather than in a send.
 */
export const CALLBACK_DATA_WORST_CASE_BYTES =
  CALLBACK_VERSION.length + 1 + CODE_CHARS + 1 + ID_CHARS + 1 + MAX_ARG_CHARS;

if (CALLBACK_DATA_WORST_CASE_BYTES > CALLBACK_DATA_MAX_BYTES) {
  throw new Error(
    `callback payload worst case is ${CALLBACK_DATA_WORST_CASE_BYTES} bytes, over ${CALLBACK_DATA_MAX_BYTES}`,
  );
}

/**
 * `Buffer.byteLength`'s isomorphic twin. `@pemby/core` is bundled for the browser as well as run
 * in the bot and the worker, so it may not reach for `Buffer`; `TextEncoder` is in every runtime
 * this repo targets and counts the same UTF-8 bytes.
 */
interface ActionSpec {
  /** The wire code. Two characters, stable for ever, never reused for another meaning. */
  code: string;
  /** The `match_pass_reason` this action records, when it is one of the picker's answers. */
  passReason?: PassReasonValue;
  /** The `flag_reason` this action records. */
  flagReason?: FlagReasonValue;
  /** The `flag_field` this action records, for `flag_reason = 'wrong_details'`. */
  flagField?: FlagFieldValue;
}

const ACTION_SPECS: Record<CallbackAction, ActionSpec> = {
  save: { code: "sv" },
  unsave: { code: "us" },
  applied: { code: "ap" },

  pass: { code: "pm" },
  "pass-location": { code: "pl", passReason: "location" },
  "pass-salary": { code: "py", passReason: "salary" },
  "pass-seniority": { code: "pn", passReason: "seniority" },
  "pass-stack": { code: "pt", passReason: "stack" },
  "pass-company": { code: "pc", passReason: "company" },
  "pass-role": { code: "pr", passReason: "role" },
  "pass-already-applied": { code: "pa", passReason: "already_applied" },
  "pass-other": { code: "po", passReason: "other" },

  flag: { code: "fm" },
  "flag-closed-or-fake": { code: "fc", flagReason: "closed_or_fake" },
  "flag-not-hiring-from-country": { code: "fn", flagReason: "not_hiring_from_country" },
  "flag-scam": { code: "fs", flagReason: "scam" },
  "flag-wrong-details": { code: "fw", flagReason: "wrong_details" },
  "flag-duplicate": { code: "fd", flagReason: "duplicate" },
  "flag-other": { code: "fo", flagReason: "other" },

  "field-salary": { code: "ds", flagField: "salary" },
  "field-seniority": { code: "dn", flagField: "seniority" },
  "field-stack": { code: "dt", flagField: "stack" },
  "field-location": { code: "dl", flagField: "location" },
  "field-eligibility": { code: "de", flagField: "eligibility" },

  back: { code: "bk" },
};

/**
 * Code -> action, built once.
 *
 * It is also where the two invariants the byte budget rests on are checked: every code is exactly
 * `CODE_CHARS` characters, and no two actions share one. Both are asserted at module load, so a
 * mistake is a crash on the first import in any of the three services rather than a button that
 * decodes to the wrong action, or a payload one byte over the limit in production.
 */
const ACTION_BY_CODE: ReadonlyMap<string, CallbackAction> = (() => {
  const byCode = new Map<string, CallbackAction>();
  for (const action of CALLBACK_ACTIONS) {
    const { code } = ACTION_SPECS[action];
    if (code.length !== CODE_CHARS) {
      throw new Error(`callback action code must be ${CODE_CHARS} characters: ${action}`);
    }
    if (byCode.has(code)) throw new Error(`duplicate callback action code: ${code}`);
    byCode.set(code, action);
  }
  return byCode;
})();

const encoder = new TextEncoder();
const byteLength = (value: string): number => encoder.encode(value).length;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HEX32_RE = /^[0-9a-f]{32}$/;
/** `arg`'s alphabet. No separator, no upper case, nothing that needs escaping anywhere. */
const ARG_RE = /^[0-9a-z]{1,8}$/;

/** The `match_pass_reason` an action records, or null if it is not a "Not for me" answer. */
export function passReasonOf(action: CallbackAction): PassReasonValue | null {
  return ACTION_SPECS[action].passReason ?? null;
}

/** The `flag_reason` an action records, or null if it is not a flag answer. */
export function flagReasonOf(action: CallbackAction): FlagReasonValue | null {
  return ACTION_SPECS[action].flagReason ?? null;
}

/** The `flag_field` an action records, or null if it is not a "Wrong details" answer. */
export function flagFieldOf(action: CallbackAction): FlagFieldValue | null {
  return ACTION_SPECS[action].flagField ?? null;
}

/**
 * The payload for one button. Throws rather than returning an over-long string: a card that would
 * carry an unusable button is a bug in the caller, and Telegram would reject the whole message
 * anyway, so the dispatcher should learn about it at the point of construction.
 *
 * `matchId` must be a lower-case canonical UUID, which is what `matches.id` always is. `arg` is the
 * optional picker state for a level below the first — which item of a fixed list the user chose —
 * and is 1 to `MAX_ARG_CHARS` characters of `[0-9a-z]`. What those characters mean belongs to the
 * picker; what they may cost belongs here.
 */
export function encodeCallbackData(action: CallbackAction, matchId: string, arg?: string): string {
  const spec = ACTION_SPECS[action] as ActionSpec | undefined;
  if (!spec) throw new Error(`unknown callback action: ${String(action)}`);
  if (!UUID_RE.test(matchId))
    throw new Error("callback matchId is not a canonical lower-case UUID");
  if (arg !== undefined && !ARG_RE.test(arg)) {
    throw new Error(`callback arg must be 1-${MAX_ARG_CHARS} characters of [0-9a-z]`);
  }

  const head = `${CALLBACK_VERSION}${SEPARATOR}${spec.code}${SEPARATOR}${matchId.replaceAll("-", "")}`;
  const data = arg === undefined ? head : `${head}${SEPARATOR}${arg}`;
  const bytes = byteLength(data);
  if (bytes > CALLBACK_DATA_MAX_BYTES) {
    throw new Error(`callback data is ${bytes} bytes, over Telegram's ${CALLBACK_DATA_MAX_BYTES}`);
  }
  return data;
}

export interface DecodedCallback {
  action: CallbackAction;
  matchId: string;
  /** The picker's own state at levels below the first, or null when the action carries none. */
  arg: string | null;
}

/**
 * The reverse, applied to hostile input: this is whatever arrived in a `callback_query` from the
 * network. Anything that is not exactly what `encodeCallbackData` produces returns null — a
 * retired code, a truncated payload, a padded one, an upper-case id, an over-long or
 * wrongly-alphabetted `arg`, a non-string.
 */
export function decodeCallbackData(data: string): DecodedCallback | null {
  if (typeof data !== "string") return null;
  // Length first, so nothing large is split or matched against a regex.
  if (data.length === 0 || data.length > CALLBACK_DATA_MAX_BYTES) return null;
  if (byteLength(data) > CALLBACK_DATA_MAX_BYTES) return null;

  const parts = data.split(SEPARATOR);
  if (parts.length !== 3 && parts.length !== 4) return null;
  const [version, code, hex, arg] = parts;
  if (version !== CALLBACK_VERSION) return null;
  if (code === undefined || hex === undefined) return null;

  const action = ACTION_BY_CODE.get(code);
  if (action === undefined) return null;
  if (!HEX32_RE.test(hex)) return null;
  if (arg !== undefined && !ARG_RE.test(arg)) return null;

  const matchId = [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
  return { action, matchId, arg: arg ?? null };
}
