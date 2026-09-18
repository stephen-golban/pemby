// Delivery kernel (PLAN D8, D13, phase 08): everything about turning one match into a message that
// three different channels can send, with no channel's SDK anywhere near it.
//
// Pure and isomorphic, like the rest of `@pemby/core`: no DB types, no React, no `next-intl`, no
// runtime dependency, and an explicit `now: Date` wherever time matters. This package never calls
// `Date.now()`, so a held message and a released one can be reasoned about from a fixed clock.
//
// Re-exported by name rather than with `export *`, so a name that would collide with the rest of
// core is a type error here and not a surprise at the import site.

export {
  asDeliverableTier,
  buildFlagFieldKeyboard,
  buildFlagReasonKeyboard,
  buildKeyboard,
  buildPassReasonKeyboard,
  renderFreshnessLine,
  renderMetaLine,
  renderPlainText,
  renderTelegramHtml,
  renderTierVerdict,
  TELEGRAM_MESSAGE_MAX_CHARS,
  type DeliverableTier,
  type CardButton,
  type CardButtonKind,
  type CardLinks,
  type KeyboardRow,
  type MetaLineOptions,
  type MatchCard,
} from "./card";

export {
  CALLBACK_ACTIONS,
  CALLBACK_DATA_MAX_BYTES,
  CALLBACK_DATA_WORST_CASE_BYTES,
  decodeCallbackData,
  encodeCallbackData,
  FLAG_FIELD_VALUES,
  FLAG_REASON_VALUES,
  flagFieldOf,
  flagReasonOf,
  MAX_ARG_CHARS,
  PASS_REASON_VALUES,
  passReasonOf,
  type CallbackAction,
  type DecodedCallback,
  type FlagFieldValue,
  type FlagReasonValue,
  type PassReasonValue,
} from "./callback";

export { resolveReasonParams } from "./params";

export { isWithinQuietHours, nextReleaseAt, type QuietWindow } from "./quiet";

export {
  DELIVERY_STRING_KEYS,
  DELIVERY_STRINGS,
  renderDeliveryString,
  renderWayLabel,
  TIER_VERDICTS,
  WAY_LABELS,
  type DeliveryStringKey,
  type WayLabelKey,
} from "./strings/en";

export { renderMatchEmail, type EmailContext, type RenderedEmail } from "./email/index";

// The signed links a match email carries. Exported from the kernel rather than from either service
// because the worker mints them and `apps/web` verifies them, and a signing format that exists in
// two copies breaks every link already sitting in an inbox the first time one copy is edited.
export {
  EMAIL_LINK_PURPOSES,
  EMAIL_LINK_SECRET_MIN_LENGTH,
  EMAIL_LINK_TTL_SECONDS,
  mintEmailLinkToken,
  verifyEmailLinkToken,
  type EmailLinkClaims,
  type EmailLinkPurpose,
} from "./email/token";
