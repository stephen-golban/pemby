// Application kits (PLAN D9), the pure part: the content shape the model returns, the bounds it is
// held to, the free-quota verdict, and the model input builder.
//
// Nothing here talks to a database, a model or React. Pemby prepares text a person copies and
// submits themselves — nothing in this module or below it submits an application anywhere.
//
// Re-exported by name rather than with `export *`, like `../delivery`, so a name that would collide
// with the rest of core is a type error here and not a surprise at the import site.

export {
  KIT_LIMITS,
  KIT_SECTIONS,
  kitContentSchema,
  kitScreeningAnswerSchema,
  normalizeKitContent,
  type KitContent,
  type KitScreeningAnswer,
  type KitSection,
} from "./schema";

export { kitQuotaVerdict, type KitQuotaInput, type KitQuotaVerdict } from "./quota";

export {
  MAX_CV_CHARS,
  MAX_JOB_DESCRIPTION_CHARS,
  MAX_SCREENING_QUESTIONS,
  MAX_SCREENING_QUESTION_CHARS,
  buildKitInput,
  type KitApplicationDefaults,
  type KitInput,
  type KitInputParts,
  type KitJobPost,
  type KitLink,
  type KitProfileFacts,
} from "./input";
