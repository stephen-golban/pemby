// LLM job enrichment: output schema, input text, quote checks and the mapping to signals. Isomorphic.
export {
  ENRICHMENT_SENIORITIES,
  LLM_SIGNAL_DETAILS,
  LLM_SIGNAL_KINDS,
  MAX_QUOTE_CHARS,
  jobEnrichmentOutputSchema,
  llmEligibilityItemSchema,
  type EnrichmentSeniority,
  type JobEnrichmentOutput,
  type LlmEligibilityItem,
  type LlmSignalKind,
} from "./schema";
export {
  MAX_DESCRIPTION_CHARS,
  buildEnrichmentInput,
  type EnrichmentInput,
  type EnrichmentInputSection,
  type EnrichmentPost,
} from "./input";
export { locateQuote, trimQuote, type QuoteMatch } from "./quote";
export {
  ENGINE_WEAK_POLICY,
  llmToSignals,
  resolveLlmPlace,
  type LlmSignalsResult,
} from "./to-signals";
