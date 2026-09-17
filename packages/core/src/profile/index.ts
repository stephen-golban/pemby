// CV-parsed profile: output schema, normalization, enum mappers and defaults (phase 06). Isomorphic.
export {
  PARSED_PROFILE_LIMITS,
  PARSED_PROFILE_VERSION,
  PROFILE_LINK_KINDS,
  PROFILE_ROLE_KINDS,
  ParsedProfileSchema,
  normalizeParsedProfile,
  type DeepPartial,
  type ParsedProfile,
  type ParsedProfilePartial,
  type ProfileLinkKind,
  type ProfileRoleKind,
} from "./schema";
export {
  DB_SENIORITIES,
  DB_WAYS_OF_WORKING,
  ENGLISH_LEVELS,
  fromDbSeniority,
  fromDbWay,
  toDbSeniority,
  toDbWay,
  type DbSeniority,
  type DbWayOfWorking,
  type EnglishLevel,
} from "./enums";
export { defaultWaysFor } from "./defaults";
