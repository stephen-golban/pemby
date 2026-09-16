// Greenhouse connector: reads the public Job Board API, one call per board with full content.
// https://docs.greenhouse.io/job-board.html
//
// There is no EU API host (`boards-api.eu.greenhouse.io` does not resolve). Boards shown on
// `job-boards.eu.greenhouse.io` are served by `boards-api.greenhouse.io` like every other board
// (checked live 2026-09-16 with `amdaris`), so `ref.region` is ignored.
import { AtsError } from "../shared/errors";
import type { AtsConnector } from "../shared/types";
import { mapGreenhouseJob } from "./map";
import { greenhouseListSchema } from "./schema";

const HOST = "boards-api.greenhouse.io";
const LIST_TIMEOUT_MS = 90_000;

export const greenhouseConnector: AtsConnector = {
  kind: "greenhouse",
  // No documented limit for the Job Board API: stay conservative.
  rateLimits: { [HOST]: { maxConcurrent: 2, minIntervalMs: 500 } },

  async listJobs(ref, ctx) {
    const url =
      `https://${HOST}/v1/boards/${encodeURIComponent(ref.boardToken)}/jobs` +
      `?content=true&pay_transparency=true`;
    // An unknown board token answers 404 on this URL, which boardRoot maps to board-not-found.
    const body = await ctx.http.getJson(url, {
      ref,
      boardRoot: true,
      signal: ctx.signal,
      timeoutMs: LIST_TIMEOUT_MS,
    });
    const parsed = greenhouseListSchema.safeParse(body);
    if (!parsed.success) {
      throw new AtsError({
        kind: "parse",
        ats: ref.ats,
        boardToken: ref.boardToken,
        url,
        message: `unexpected job list shape: ${parsed.error.issues
          .slice(0, 3)
          .map((issue) => `${issue.path.join(".")} ${issue.message}`)
          .join("; ")}`,
        cause: parsed.error,
      });
    }
    return parsed.data.jobs.map((job) => mapGreenhouseJob(ref, job));
  },
};
