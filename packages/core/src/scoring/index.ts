// Match scoring (PLAN section 4). Weights and thresholds are private config, loaded with
// `loadScoringWeights()` from `@pemby/core/private-config`; nothing here has a default weight.
import type { ScoreComponent, ScoringWeights } from "../private-config/schemas";

export type { ScoreComponent, ScoringWeights };
export { SCORE_COMPONENTS } from "../private-config/schemas";

export {
  MAX_SCORE_REASON,
  SCORE_REASONS,
  SCORE_REASON_KEYS,
  renderScoreReason,
  type ScoreReason,
  type ScoreReasonKey,
} from "./reasons";
export {
  NUDGE_LIMITS,
  applyPassFeedback,
  nudgeForJob,
  nudgeKeysFor,
  nudgeKeysOfJob,
  toNudgeJob,
  type AppliedNudge,
  type NudgeJob,
  type NudgeTotal,
  type PassFeedback,
} from "./nudges";
export {
  EVIDENCE_FLOOR,
  MIN_EVIDENCE_COMPONENTS,
  SCORER_VERSION,
  scoreMatch,
  type ComponentAbsence,
  type ComponentSignal,
  type MatchScore,
  type ScoreComponentResult,
  type ScoreInput,
} from "./score";
