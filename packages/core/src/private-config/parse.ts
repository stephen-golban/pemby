// Validates raw config files into typed objects. Error messages carry paths and schema
// issues only, never file contents.
import type { z } from "zod";

import { PrivateConfigError } from "./errors";
import type { RawPrivateConfig, PrivateConfigVersion } from "./read";
import {
  manifestSchema,
  promptFrontMatterSchema,
  promptNameSchema,
  REQUIRED_PROMPTS,
  scoringWeightsSchema,
  sourceListNameSchema,
  sourceListSchema,
  type PrivateConfigManifest,
  type ScoringWeights,
  type SourceList,
} from "./schemas";

export interface PromptTemplate {
  name: string;
  /** From the prompt's front-matter. */
  version: string;
  description?: string;
  text: string;
  /** `<name>@<version>+<config short id>`; store this in ai_usage and job_enrichment rows. */
  versionId: string;
}

export interface PrivateConfig {
  version: PrivateConfigVersion;
  manifest: PrivateConfigManifest;
  prompts: ReadonlyMap<string, PromptTemplate>;
  scoringWeights: ScoringWeights;
  sourceLists: ReadonlyMap<string, SourceList>;
}

function formatIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}

function parseJsonFile<T>(path: string, text: string, schema: z.ZodType<T>): T {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    // The JSON.parse message can quote file contents, so it is dropped.
    throw new PrivateConfigError("invalid-file", `${path} is not valid JSON.`);
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    throw new PrivateConfigError(
      "invalid-file",
      `${path} failed validation: ${formatIssues(result.error)}.`,
    );
  }
  return result.data;
}

function parseFrontMatter(
  path: string,
  text: string,
): { meta: Record<string, string>; body: string } {
  const normalized = text.replace(/\r\n/g, "\n");
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(normalized);
  if (!match) {
    throw new PrivateConfigError(
      "invalid-file",
      `${path} must start with a --- front-matter block.`,
    );
  }
  const meta: Record<string, string> = {};
  for (const line of (match[1] ?? "").split("\n")) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    const colon = line.indexOf(":");
    if (colon <= 0) {
      throw new PrivateConfigError("invalid-file", `${path} has a malformed front-matter line.`);
    }
    const key = line.slice(0, colon).trim();
    const value = line
      .slice(colon + 1)
      .trim()
      .replace(/^(["'])(.*)\1$/, "$2");
    meta[key] = value;
  }
  return { meta, body: (match[2] ?? "").trim() };
}

function baseName(path: string, extension: string): string {
  return path.slice(path.lastIndexOf("/") + 1, -extension.length);
}

export function parsePrivateConfig(raw: RawPrivateConfig): PrivateConfig {
  const { files, version } = raw;

  const manifestText = files.get("manifest.json");
  if (manifestText === undefined) {
    throw new PrivateConfigError("invalid-layout", "manifest.json is missing at the config root.");
  }
  const manifest = parseJsonFile("manifest.json", manifestText, manifestSchema);

  const weightsText = files.get("scoring/weights.json");
  if (weightsText === undefined) {
    throw new PrivateConfigError("invalid-layout", "scoring/weights.json is missing.");
  }
  const scoringWeights = parseJsonFile("scoring/weights.json", weightsText, scoringWeightsSchema);

  const prompts = new Map<string, PromptTemplate>();
  const sourceLists = new Map<string, SourceList>();

  for (const [path, text] of files) {
    if (path.startsWith("prompts/")) {
      const name = baseName(path, ".md");
      if (!promptNameSchema.safeParse(name).success) {
        throw new PrivateConfigError(
          "invalid-file",
          `${path}: prompt names are lowercase kebab-case.`,
        );
      }
      const { meta, body } = parseFrontMatter(path, text);
      const front = promptFrontMatterSchema.safeParse(meta);
      if (!front.success) {
        throw new PrivateConfigError(
          "invalid-file",
          `${path} front-matter: ${formatIssues(front.error)}.`,
        );
      }
      if (body === "")
        throw new PrivateConfigError("invalid-file", `${path} has an empty prompt body.`);
      prompts.set(name, {
        name,
        version: front.data.version,
        ...(front.data.description === undefined ? {} : { description: front.data.description }),
        text: body,
        versionId: `${name}@${front.data.version}+${version.shortId}`,
      });
    } else if (path.startsWith("sources/")) {
      const name = baseName(path, ".json");
      if (!sourceListNameSchema.safeParse(name).success) {
        throw new PrivateConfigError(
          "invalid-file",
          `${path}: source list names are lowercase kebab-case.`,
        );
      }
      sourceLists.set(name, parseJsonFile(path, text, sourceListSchema));
    }
  }

  for (const name of REQUIRED_PROMPTS) {
    if (!prompts.has(name)) {
      throw new PrivateConfigError(
        "invalid-layout",
        `prompts/${name}.md is missing; the default AI routing requires prompt "${name}".`,
      );
    }
  }

  return { version, manifest, prompts, scoringWeights, sourceLists };
}
