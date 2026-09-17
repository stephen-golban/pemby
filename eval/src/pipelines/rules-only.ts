// Deterministic pipeline: the rules extractor plus the eligibility engine, no model calls.
import { decideEligibility, extractRuleSignals } from "@pemby/core";
import type { EligibilityPipeline } from "../pipeline";

export const rulesOnly: EligibilityPipeline = {
  name: "rules-only",
  async evaluate(snapshot, countries, ways) {
    const rules = extractRuleSignals({
      title: snapshot.title,
      locations: snapshot.locations,
      workplaceType: snapshot.workplaceType,
      employmentType: snapshot.employmentType,
      descriptionText: snapshot.descriptionText,
    });
    const verdicts = decideEligibility({
      rules,
      countries,
      ways,
      // Region memberships and evidence freshness as of when the post was captured.
      now: new Date(snapshot.capturedAt),
    });
    return verdicts.map((v) => ({
      country: v.country,
      wayOfWorking: v.wayOfWorking as (typeof ways)[number],
      tier: v.tier,
      reason: `${v.reasonKey}: ${v.reason}`,
    }));
  },
};

export default rulesOnly;
