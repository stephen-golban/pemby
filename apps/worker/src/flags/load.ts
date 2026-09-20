// Re-read one claimed flag by id, for the handler that the sweep enqueued.
//
// The sweep claims a batch and sends one `flags.process` job per flag, carrying **only the flag
// id**. Nothing else goes in the payload, because pg-boss stores `job.data` in `pgboss.job` in the
// clear and `flags.country` is the flagger's own residence — personal data, on a row that outlives
// the job by days.
//
// This is a deliberate duplicate of `claimFlagsToProcess`'s SELECT half, minus the claim. It
// re-applies the demo guard rather than trusting that the claim did, and it **does not select
// `note`** — the same rule and the same reason as the kernel's: free text from an "Other" flag goes
// to the owner review queue and nowhere else, and this module is the one that calls models, so text
// it never loads is text it cannot pass on.
import type { Db, FlagToProcess } from "@pemby/db";
import { sql } from "drizzle-orm";

type Row = {
  flag_id: string;
  job_id: string;
  company_id: string;
  user_id: string | null;
  reason: FlagToProcess["reason"];
  country: string | null;
  field: FlagToProcess["field"];
  field_value: string | null;
  weight: number;
  claim_attempts: number;
  created_at_ms: string;
  job_status: FlagToProcess["jobStatus"];
  job_title: string;
  job_url: string;
  company_domain: string | null;
  duplicate_of_job_id: string | null;
};

/**
 * The flag, or null when a rule must not act on it: it is gone, it already has a verdict, or it is
 * demo (the job, the company or the flagger).
 *
 * Returning null for demo rather than writing `auto_resolved` is on purpose. Staging holds a seeded
 * flag that is `status = 'open'` while carrying `action_taken = 'reverification_queued'` — `status`
 * and `action_taken` have drifted on that row — and the **only** thing keeping it away from the
 * rules is this guard. Writing any verdict on it would be this module editing seed data to tidy up
 * a fixture. It stays exactly as it is, and the owner's review queue is where it shows up.
 */
export async function loadFlagForRule(db: Db, flagId: string): Promise<FlagToProcess | null> {
  const rows = await db.execute<Row>(sql`
    select
      f.id as flag_id, f.job_id, f.user_id, f.reason, f.country, f.field,
      f.field_value, f.weight::real as weight, f.claim_attempts, f.duplicate_of_job_id,
      (extract(epoch from f.created_at) * 1000)::bigint as created_at_ms,
      j.status::text as job_status, j.title as job_title, j.url as job_url,
      c.id as company_id, c.domain as company_domain
      from flags f
      join jobs j on j.id = f.job_id
      join companies c on c.id = j.company_id
     where f.id = ${flagId}::uuid
       and f.status = 'open'
       and j.is_demo = false
       and c.is_demo = false
       and not exists (
             select 1 from profiles p where p.user_id = f.user_id and p.is_demo = true
           )
  `);
  const r = rows.rows[0];
  if (!r) return null;
  return {
    flagId: r.flag_id,
    jobId: r.job_id,
    companyId: r.company_id,
    userId: r.user_id,
    reason: r.reason,
    country: r.country,
    field: r.field,
    fieldValue: r.field_value,
    weight: Number(r.weight),
    claimAttempts: Number(r.claim_attempts),
    createdAt: new Date(Number(r.created_at_ms)),
    jobStatus: r.job_status,
    jobTitle: r.job_title,
    jobUrl: r.job_url,
    companyDomain: r.company_domain,
    duplicateOfJobId: r.duplicate_of_job_id,
  };
}
