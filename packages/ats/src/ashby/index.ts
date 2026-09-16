// Ashby connector: reads the public job posting API, one call per board with descriptions and
// compensation. https://developers.ashbyhq.com/docs/public-job-posting-api
//
// No regional host exists, so `ref.region` is ignored. Unlisted jobs (`isListed: false`, meant
// for direct links only) are left out.
import { AtsError } from "../shared/errors";
import type { AtsConnector } from "../shared/types";
import { mapAshbyJob } from "./map";
import { ashbyBoardSchema } from "./schema";

const HOST = "api.ashbyhq.com";
const LIST_TIMEOUT_MS = 90_000;

export const ashbyConnector: AtsConnector = {
  kind: "ashby",
  // No documented limit. Responses are cached for 60 s, so polling faster gains nothing.
  rateLimits: { [HOST]: { maxConcurrent: 2, minIntervalMs: 500 } },

  async listJobs(ref, ctx) {
    const url =
      `https://${HOST}/posting-api/job-board/${encodeURIComponent(ref.boardToken)}` +
      `?includeCompensation=true`;
    const body = await ctx.http.getJson(url, {
      ref,
      boardRoot: true,
      signal: ctx.signal,
      timeoutMs: LIST_TIMEOUT_MS,
    });
    const parsed = ashbyBoardSchema.safeParse(body);
    if (!parsed.success) {
      throw new AtsError({
        kind: "parse",
        ats: ref.ats,
        boardToken: ref.boardToken,
        url,
        message: `unexpected job board shape: ${parsed.error.issues
          .slice(0, 3)
          .map((issue) => `${issue.path.join(".")} ${issue.message}`)
          .join("; ")}`,
        cause: parsed.error,
      });
    }
    return parsed.data.jobs
      .filter((job) => job.isListed !== false)
      .map((job) => mapAshbyJob(ref, job));
  },
};
