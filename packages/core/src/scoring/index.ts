// Match scoring (PLAN section 4). Weights and thresholds are private config, loaded with
// `loadScoringWeights()` from `@pemby/core/private-config`. Types only here.
import type { ScoreComponent, ScoringWeights } from "../private-config/schemas";

export type { ScoreComponent, ScoringWeights };
export { SCORE_COMPONENTS } from "../private-config/schemas";

/** Each component normalized to 0..1 before weighting. */
export type ScoreInputs = Readonly<Record<ScoreComponent, number>>;

export interface MatchScore {
  /** 0..100 */
  total: number;
  components: ScoreInputs;
  /** Top 3 templated reasons. */
  reasons: readonly string[];
  /** One templated gap, if any. */
  gap: string | null;
}
