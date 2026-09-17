import {
  DB_SENIORITIES,
  TARGET_COUNTRIES,
  countryName,
  toDbSeniority,
  toDbWay,
  type DbSeniority,
  type Seniority,
} from "@pemby/core";
import { getDb } from "@pemby/db";
import type { TeaserInput, TeaserJob, TeaserOptions, TeaserResult, TeaserSource } from "./index";
import { recoverReason } from "./reason";
import { compatibleFamilies } from "./roles";

/**
 * Freshness gate. The matcher (PLAN D6) requires verification in the last 24 h; the teaser allows
 * 72 h because staging's freshness sweeps are sparse and a 24 h window empties the count between
 * sweeps. Phase 07 tightens this to the matcher's 24 h.
 */
export const TEASER_FRESHNESS_HOURS = 72;

const DEFAULT_LIMIT = 3;
const MAX_LIMIT = 10;

/**
 * Job seniorities shown for a person's seniority: within one level. Interns and juniors are
 * tolerant the other way: they see intern and junior jobs, not middle. Jobs with no stated
 * seniority always pass (handled in SQL). Null seniority skips the gate.
 */
export function allowedJobSeniorities(seniority: Seniority | null): DbSeniority[] | null {
  if (seniority === null) return null;
  const own = toDbSeniority(seniority);
  if (own === "intern" || own === "junior") return ["intern", "junior"];
  const i = DB_SENIORITIES.indexOf(own);
  return DB_SENIORITIES.filter((_, j) => Math.abs(j - i) <= 1);
}

/** `TEASER_INCLUDE_DEMO=true` lets seeded demo jobs count (local demos only). */
function includeDemo(): boolean {
  return process.env.TEASER_INCLUDE_DEMO === "true";
}

interface Row {
  id: string;
  title: string;
  company: string;
  location_text: string | null;
  url: string;
  reason: string;
  total: string;
}

// Access path: `job_eligibility_scope_tier_idx (scope, tier, way_of_working)` yields the few green
// rows for the country, then primary-key lookups into jobs, job_enrichment and companies. Nothing
// scans jobs. Ways are ranked by their position in the person's list; the best-ranked green row's
// reason is the one shown.
const TEASER_SQL = `
with green as (
  select el.job_id,
         (array_agg(el.reason order by array_position($2::way_of_working[], el.way_of_working)))[1]
           as reason
    from job_eligibility el
   where el.scope = $1
     and el.tier = 'green'
     and el.way_of_working = any($2::way_of_working[])
   group by el.job_id
)
select j.id, j.title, c.name as company, j.location_text, j.url, g.reason,
       count(*) over () as total
  from green g
  join jobs j on j.id = g.job_id
  join job_enrichment e on e.job_id = j.id
  join companies c on c.id = j.company_id
 where j.status = 'open'
   and j.duplicate_of_job_id is null
   and j.last_verified_live_at > now() - make_interval(hours => $3::int)
   and ($4::boolean or not j.is_demo)
   and not e.asks_candidate_for_money
   and ($5::text[] is null or coalesce(e.role_family, j.role_family) = any($5::text[]))
   and ($6::seniority[] is null or e.seniority is null or e.seniority = any($6::seniority[]))
 order by (select count(*) from unnest(e.stack) s where lower(s) = any($7::text[])) desc,
          j.first_seen_at desc,
          j.id
 limit $8`;

/** Exported with its params for EXPLAIN in proof scripts. */
export const TEASER_QUERY = TEASER_SQL;

export function teaserQueryParams(input: TeaserInput & { country: string }, limit: number) {
  return [
    input.country,
    [...new Set(input.ways.map(toDbWay))],
    TEASER_FRESHNESS_HOURS,
    includeDemo(),
    compatibleFamilies(input.titles),
    allowedJobSeniorities(input.seniority),
    [...new Set(input.stack.map((s) => s.toLowerCase()))],
    limit,
  ];
}

const LOCATION_ENTRIES_MAX = 3;

/**
 * `location_text` joins every location the board lists with "; ", sometimes dozens. The teaser
 * keeps at most three, those naming the person's country first; the reason already says why the
 * job is open to them.
 */
export function shortLocation(text: string | null, country: string | null): string | null {
  if (text === null) return null;
  const entries = text.split("; ").filter((e) => e.trim() !== "");
  if (entries.length <= LOCATION_ENTRIES_MAX) return text;
  const named = country ? entries.filter((e) => e.includes(country)) : [];
  const rest = entries.filter((e) => !named.includes(e));
  return [...named, ...rest].slice(0, LOCATION_ENTRIES_MAX).join("; ");
}

export const sqlTeaserSource: TeaserSource = {
  async teaser(input: TeaserInput, opts?: TeaserOptions): Promise<TeaserResult> {
    const country = input.country;
    if (country === null) {
      return { country: null, countryName: null, count: null, jobs: [], basis: "no_country" };
    }
    const name = countryName(country) ?? null;
    if (!(TARGET_COUNTRIES as readonly string[]).includes(country)) {
      return { country, countryName: name, count: null, jobs: [], basis: "unsupported_country" };
    }
    if (input.ways.length === 0) {
      return { country, countryName: name, count: 0, jobs: [], basis: "ok" };
    }

    const limit = Math.min(Math.max(Math.trunc(opts?.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT);
    const params = teaserQueryParams({ ...input, country }, limit);
    const { rows } = await getDb().$client.query<Row>(TEASER_SQL, params);
    // `count(*) over ()` runs before the limit; no rows back means no jobs cleared the gates.
    const total = rows[0] ? Number(rows[0].total) : 0;

    const jobs: TeaserJob[] = rows.map((r) => ({
      id: r.id,
      title: r.title,
      company: r.company,
      location: shortLocation(r.location_text, name),
      url: r.url,
      ...recoverReason(r.reason),
    }));
    return { country, countryName: name, count: total, jobs, basis: "ok" };
  },
};
