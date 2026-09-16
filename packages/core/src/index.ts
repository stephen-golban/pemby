// `@pemby/core`: isomorphic domain types. The Node-only config loader lives at
// `@pemby/core/private-config` so browser bundles never pull in node:fs or node:zlib.
export * from "./eligibility";
export * from "./ways-of-working";
export * from "./gates";
export * from "./scoring";
export * from "./near-miss";
export * from "./entitlements";
export * from "./ai-contract";
export {
  ATS_KINDS,
  PRIVATE_CONFIG_SCHEMA_VERSION,
  REQUIRED_PROMPTS,
  type RequiredPromptName,
  type AtsKind,
  type PrivateConfigManifest,
  type SourceEntry,
  type SourceList,
} from "./private-config/schemas";
