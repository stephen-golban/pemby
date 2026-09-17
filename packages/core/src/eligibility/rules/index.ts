// Deterministic eligibility extraction (phase 05, rules before any LLM call). Isomorphic.
export { RULES_VERSION, extractRuleSignals, type RuleExtraction, type RuleInput } from "./extract";
export { extractSalaries, type SalaryMention, type SalaryPeriod } from "./salary";
export { extractTimezoneHits, type TimezoneHit } from "./timezone";
export { splitSentences, type Sentence } from "./text";
export { UNACCOUNTED_CUES, type UnaccountedSentence } from "./unaccounted";
