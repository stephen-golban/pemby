// Hard gates (PLAN D6). Pure and isomorphic: plain data in, plain data out, clock passed in.
export {
  DB_HARD_GATES,
  HARD_GATES,
  fromDbGate,
  toDbGate,
  type DbHardGate,
  type HardGate,
} from "./enums";
export {
  GATE_REASONS,
  GATE_REASON_KEYS,
  MAX_GATE_REASON,
  renderGateReason,
  type GateReason,
  type GateReasonKey,
} from "./reasons";
export {
  FRESHNESS_HOURS,
  JUNIOR_SENIORITY_DISTANCE,
  JUNIOR_TOLERANCE_YEARS,
  SENIORITY_DISTANCE,
  YEARS_SHORTFALL_TOLERANCE_YEARS,
  evaluateGates,
  yearsVerdict,
  type GateInput,
  type GateOutcome,
  type GateRejection,
  type GateResult,
  type GateResults,
  type YearsVerdict,
} from "./evaluate";
