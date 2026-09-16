// Lever connector: reads the public Postings API, one call per site with full postings.
// https://github.com/lever/postings-api
//
// A site lives on exactly one instance: region "eu" reads api.eu.lever.co, anything else
// api.lever.co. Both answer 404 for an unknown site (also for a site on the other instance), and
// 200 `[]` for a site with no open postings.
import { AtsError } from "../shared/errors";
import type { HostRateLimit } from "../shared/http";
import type { AtsConnector } from "../shared/types";
import { mapLeverPosting } from "./map";
import { leverListSchema } from "./schema";

const GLOBAL_HOST = "api.lever.co";
const EU_HOST = "api.eu.lever.co";
const LIST_TIMEOUT_MS = 90_000;
// robots.txt on the API host asks for `Crawl-delay: 1`.
const CRAWL_DELAY: HostRateLimit = { maxConcurrent: 1, minIntervalMs: 1000 };

export const leverConnector: AtsConnector = {
  kind: "lever",
  rateLimits: { [GLOBAL_HOST]: CRAWL_DELAY, [EU_HOST]: CRAWL_DELAY },

  async listJobs(ref, ctx) {
    const host = ref.region === "eu" ? EU_HOST : GLOBAL_HOST;
    const url = `https://${host}/v0/postings/${encodeURIComponent(ref.boardToken)}?mode=json`;
    const body = await ctx.http.getJson(url, {
      ref,
      boardRoot: true,
      signal: ctx.signal,
      timeoutMs: LIST_TIMEOUT_MS,
    });
    const parsed = leverListSchema.safeParse(body);
    if (!parsed.success) {
      throw new AtsError({
        kind: "parse",
        ats: ref.ats,
        boardToken: ref.boardToken,
        url,
        message: `unexpected postings shape: ${parsed.error.issues
          .slice(0, 3)
          .map((issue) => `${issue.path.join(".")} ${issue.message}`)
          .join("; ")}`,
        cause: parsed.error,
      });
    }
    return parsed.data.map((posting) => mapLeverPosting(ref, posting));
  },
};
