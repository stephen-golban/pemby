// Server-only entry: `@pemby/core/private-config`.
// Loads prompts, scoring weights and source lists from the private GitHub repo (or a local
// directory) once per process. Call `loadPrivateConfig()` at service boot so a bad config
// crashes the service immediately instead of on the first job.
import { resolvePrivateConfigSource, type EnvLike } from "./env";
import { PrivateConfigError } from "./errors";
import { parsePrivateConfig, type PrivateConfig, type PromptTemplate } from "./parse";
import { readPrivateConfigFiles, type PrivateConfigVersion } from "./read";
import type { ScoringWeights, SourceList } from "./schemas";

export { PrivateConfigError, type PrivateConfigErrorCode } from "./errors";
export {
  resolvePrivateConfigSource,
  type AppEnv,
  type EnvLike,
  type PrivateConfigSource,
} from "./env";
export type { PrivateConfig, PromptTemplate } from "./parse";
export type { PrivateConfigVersion } from "./read";
export * from "./schemas";

export interface PrivateConfigLoader {
  /** Loads and validates everything once; later calls return the cached result. */
  load(): Promise<PrivateConfig>;
  /** Throws `not-found` for an unknown name, or when `version` is given and differs. */
  loadPrompt(name: string, version?: string): Promise<PromptTemplate>;
  loadScoringWeights(): Promise<ScoringWeights>;
  loadSourceLists(): Promise<ReadonlyMap<string, SourceList>>;
  getVersion(): Promise<PrivateConfigVersion>;
}

export function createPrivateConfigLoader(env: EnvLike): PrivateConfigLoader {
  let cached: Promise<PrivateConfig> | undefined;

  async function loadOnce(): Promise<PrivateConfig> {
    const source = resolvePrivateConfigSource(env);
    const config = parsePrivateConfig(await readPrivateConfigFiles(source));
    if (config.manifest.placeholder && source.appEnv !== "development") {
      throw new PrivateConfigError(
        "placeholder-not-allowed",
        `Placeholder config (manifest.placeholder=true) is not allowed with APP_ENV=${source.appEnv}.`,
      );
    }
    return config;
  }

  const load = (): Promise<PrivateConfig> => {
    if (!cached) {
      cached = loadOnce();
      // A failed load is not cached, so a caller that catches can retry.
      cached.catch(() => {
        cached = undefined;
      });
    }
    return cached;
  };

  return {
    load,
    async loadPrompt(name, version) {
      const prompt = (await load()).prompts.get(name);
      if (!prompt)
        throw new PrivateConfigError("not-found", `Prompt "${name}" is not in the private config.`);
      if (version !== undefined && prompt.version !== version) {
        throw new PrivateConfigError(
          "not-found",
          `Prompt "${name}" is at version ${prompt.version}, not the requested ${version}.`,
        );
      }
      return prompt;
    },
    async loadScoringWeights() {
      return (await load()).scoringWeights;
    },
    async loadSourceLists() {
      return (await load()).sourceLists;
    },
    async getVersion() {
      return (await load()).version;
    },
  };
}

const defaultLoader = createPrivateConfigLoader(process.env);

/** Process-wide loader over `process.env`. */
export const loadPrivateConfig = defaultLoader.load;
export const loadPrompt = defaultLoader.loadPrompt;
export const loadScoringWeights = defaultLoader.loadScoringWeights;
export const loadSourceLists = defaultLoader.loadSourceLists;
export const getPrivateConfigVersion = defaultLoader.getVersion;
