// @pemby/ats: read public job-board APIs of ATS vendors and return one normalized job shape.
export { createAtsHttpClient, getConnector, isConnectorImplemented } from "./connectors";
export { AtsError, isAtsError, type AtsErrorInit, type AtsErrorKind } from "./shared/errors";
export {
  createHttpClient,
  DEFAULT_HOST_LIMIT,
  DEFAULT_TIMEOUT_MS,
  parseRetryAfter,
  PEMBY_USER_AGENT,
  type HostRateLimit,
  type HttpClient,
  type HttpClientOptions,
  type HttpResponse,
  type RequestOptions,
} from "./shared/http";
export {
  contentHash,
  decodeHtmlEntities,
  htmlToText,
  parseDate,
  workplaceTypeFromText,
  type ContentHashInput,
} from "./shared/text";
export {
  boardRefFromSource,
  type AtsConnector,
  type BoardRef,
  type ConnectorContext,
  type NormalizedJob,
  type NormalizedSalary,
  type SalaryPeriod,
  type WorkplaceType,
} from "./shared/types";
