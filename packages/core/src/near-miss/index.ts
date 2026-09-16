// Near misses (PLAN D7, section 4.6): jobs that failed exactly one gate or scored just
// under the match threshold, grouped by blocker. Types only.
import type { HardGate } from "../gates";

export type NearMissBlocker = HardGate | "score";

export interface NearMiss {
  jobId: string;
  blocker: NearMissBlocker;
  score: number;
}

export interface NearMissGroup {
  blocker: NearMissBlocker;
  count: number;
  jobIds: readonly string[];
}
