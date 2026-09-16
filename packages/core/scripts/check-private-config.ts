// Loads private config from the current env and prints only names, counts and version ids.
// Usage: PRIVATE_CONFIG_DIR=./private-config.example pnpm --filter @pemby/core check:private-config
import { PrivateConfigError, SCORE_COMPONENTS, loadPrivateConfig } from "../src/private-config";

try {
  const config = await loadPrivateConfig();
  const { version, manifest, prompts, scoringWeights, sourceLists } = config;

  console.log(`source:        ${version.source}${version.ref ? ` (ref ${version.ref})` : ""}`);
  console.log(`version id:    ${version.shortId}`);
  console.log(`placeholder:   ${manifest.placeholder}`);
  console.log(`prompts:       ${prompts.size}`);
  for (const prompt of prompts.values()) console.log(`  - ${prompt.versionId}`);
  console.log(
    `scoring:       weights ${scoringWeights.version}, ${SCORE_COMPONENTS.length} components`,
  );
  console.log(`source lists:  ${sourceLists.size}`);
  for (const [name, list] of sourceLists) {
    console.log(`  - ${name}: ${list.entries.length} entries`);
  }
} catch (error) {
  if (error instanceof PrivateConfigError) {
    console.error(`${error.code}: ${error.message}`);
  } else {
    console.error(`unexpected ${error instanceof Error ? error.name : "error"}`);
  }
  process.exitCode = 1;
}
