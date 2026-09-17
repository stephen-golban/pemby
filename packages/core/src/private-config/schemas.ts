// Zod schemas for the private config repo layout. Isomorphic: no Node imports here,
// so `@pemby/core` can re-export the types to browser code.
//
// Layout (see docs/private-config.md):
//   manifest.json          { schemaVersion: 1, placeholder: boolean }
//   prompts/<name>.md      front-matter `version: <id>` then the prompt text
//   scoring/weights.json   ScoringWeights
//   sources/<list>.json    SourceList
//   routing.json           RoutingConfig (optional; absent means `@pemby/ai` DEFAULT_ROUTING)
import { z } from "zod";

import { AI_TASKS } from "../ai-contract";

export const PRIVATE_CONFIG_SCHEMA_VERSION = 1;

export const manifestSchema = z.object({
  schemaVersion: z.literal(PRIVATE_CONFIG_SCHEMA_VERSION),
  // true only in private-config.example; staging and production refuse placeholder config.
  placeholder: z.boolean(),
});
export type PrivateConfigManifest = z.infer<typeof manifestSchema>;

export const promptNameSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/, "prompt names are lowercase kebab-case");

export const promptFrontMatterSchema = z.object({
  version: z.string().regex(/^[A-Za-z0-9._-]{1,64}$/, "version is 1-64 chars of [A-Za-z0-9._-]"),
  description: z.string().max(200).optional(),
});
export type PromptFrontMatter = z.infer<typeof promptFrontMatterSchema>;

/**
 * Prompts the default AI routing needs (`@pemby/ai` DEFAULT_ROUTING `promptName`s). The loader
 * refuses a config that lacks any of them, so a service fails at boot, not on the first job.
 */
export const REQUIRED_PROMPTS = ["job-enrichment", "cv-parse", "application-kit"] as const;
export type RequiredPromptName = (typeof REQUIRED_PROMPTS)[number];

/**
 * Prompts a routed task uses that the loader does not demand at boot, because the task has not
 * shipped everywhere yet. A task whose optional prompt is missing fails when it runs, with an error
 * naming the prompt. Move a name to REQUIRED_PROMPTS once its job runs in production.
 */
export const OPTIONAL_PROMPTS = ["company-evidence"] as const;
export type OptionalPromptName = (typeof OPTIONAL_PROMPTS)[number];

/** Every prompt name `@pemby/ai` routing may reference. */
export const ROUTED_PROMPTS = [...REQUIRED_PROMPTS, ...OPTIONAL_PROMPTS] as const;
export type RoutedPromptName = (typeof ROUTED_PROMPTS)[number];

// ---------------------------------------------------------------- routing.json

/** OpenRouter model ids: `vendor/model`, optionally with a `:variant` such as `:free`. */
export const modelIdSchema = z
  .string()
  .regex(
    /^[a-z0-9][a-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*(:[a-z0-9-]+)?$/,
    "model ids look like vendor/model or vendor/model:variant",
  );

export const REASONING_EFFORTS = ["none", "minimal", "low", "medium", "high"] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

/**
 * Per-task call parameters. `reasoning` maps to OpenRouter's `reasoning` object; `effort` and
 * `maxTokens` are mutually exclusive there, so the schema allows one of them.
 */
export const taskParamsSchema = z
  .object({
    temperature: z.number().min(0).max(2).optional(),
    maxOutputTokens: z.number().int().min(1).max(64_000).optional(),
    reasoning: z
      .object({
        enabled: z.boolean().optional(),
        effort: z.enum(REASONING_EFFORTS).optional(),
        maxTokens: z.number().int().min(1).max(64_000).optional(),
        exclude: z.boolean().optional(),
      })
      .strict()
      .refine((r) => r.effort === undefined || r.maxTokens === undefined, {
        message: "set reasoning.effort or reasoning.maxTokens, not both",
      })
      .optional(),
  })
  .strict();
export type TaskParams = z.infer<typeof taskParamsSchema>;

/**
 * One task's override. Strict on purpose: only models and parameters are configurable. Key class,
 * personal-data flag, model kind and prompt name stay in code (`@pemby/ai` DEFAULT_ROUTING), so a
 * config can never move a personal-data task to the public key.
 */
export const taskRoutingOverrideSchema = z
  .object({
    model: modelIdSchema,
    fallbackModels: z.array(modelIdSchema).max(4).default([]),
    params: taskParamsSchema.optional(),
  })
  .strict()
  .refine((o) => !o.fallbackModels.includes(o.model), {
    message: "fallbackModels must not repeat model",
    path: ["fallbackModels"],
  });
export type TaskRoutingOverride = z.infer<typeof taskRoutingOverrideSchema>;

export const routingConfigSchema = z
  .object({
    version: z.string().min(1).max(64),
    tasks: z.partialRecord(z.enum(AI_TASKS), taskRoutingOverrideSchema),
  })
  .strict();
export type RoutingConfig = z.infer<typeof routingConfigSchema>;

/** Score components from PLAN section 4. Weights must sum to 1. */
export const SCORE_COMPONENTS = [
  "embeddingSimilarity",
  "skillOverlap",
  "domain",
  "timezoneOverlap",
  "companyFit",
] as const;
export type ScoreComponent = (typeof SCORE_COMPONENTS)[number];

const weight = z.number().min(0).max(1);

export const scoringWeightsSchema = z
  .object({
    version: z.string().min(1).max(64),
    components: z.object({
      embeddingSimilarity: weight,
      skillOverlap: weight,
      domain: weight,
      timezoneOverlap: weight,
      companyFit: weight,
    }),
    thresholds: z.object({
      /** Score (0-100) at or above which a job becomes a match. */
      match: z.number().int().min(0).max(100),
      /** Lowest score (0-100) that still counts as a near miss. */
      nearMissMin: z.number().int().min(0).max(100),
    }),
  })
  .superRefine((value, ctx) => {
    const sum = SCORE_COMPONENTS.reduce((total, key) => total + value.components[key], 0);
    if (Math.abs(sum - 1) > 1e-6) {
      ctx.addIssue({ code: "custom", path: ["components"], message: "weights must sum to 1" });
    }
    if (value.thresholds.nearMissMin >= value.thresholds.match) {
      ctx.addIssue({
        code: "custom",
        path: ["thresholds", "nearMissMin"],
        message: "nearMissMin must be below match",
      });
    }
  });
export type ScoringWeights = z.infer<typeof scoringWeightsSchema>;

/** ATS connectors planned in PLAN section 3 (packages/ats). */
export const ATS_KINDS = [
  "greenhouse",
  "lever",
  "ashby",
  "workable",
  "smartrecruiters",
  "recruitee",
  "personio",
] as const;
export type AtsKind = (typeof ATS_KINDS)[number];

/** Vendor data region of a board. Absent in a source entry means "us". */
export const ATS_REGIONS = ["us", "eu"] as const;
export type AtsRegion = (typeof ATS_REGIONS)[number];

export const sourceListNameSchema = promptNameSchema;

export const sourceEntrySchema = z.object({
  ats: z.enum(ATS_KINDS),
  boardToken: z.string().min(1).max(200),
  companyName: z.string().min(1).max(200).optional(),
  domain: z.string().min(1).max(253).optional(),
  region: z.enum(ATS_REGIONS).optional(),
});
export type SourceEntry = z.infer<typeof sourceEntrySchema>;

export const sourceListSchema = z.object({
  version: z.string().min(1).max(64),
  entries: z.array(sourceEntrySchema),
});
export type SourceList = z.infer<typeof sourceListSchema>;
