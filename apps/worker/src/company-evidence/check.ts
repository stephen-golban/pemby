// One company check: discover pages, extract and verify statements, map to evidence rows, and
// (unless dry) replace the company's careers-page evidence in one transaction.
import type { CompanyEvidenceStatus, Db, NewEligibilityEvidence } from "@pemby/db";
import { schema } from "@pemby/db";
import { and, eq, sql } from "drizzle-orm";
import { discoverCompanyPages, normalizeDomain, type DiscoveryResult } from "./discover";
import {
  extractCompanyEvidence,
  statementsToEvidenceRows,
  type ExtractOptions,
  type ExtractionResult,
} from "./extract";
import type { HostLookup, Transport } from "./net";

const { companies, eligibilityEvidence } = schema;

export interface CompanyForEvidence {
  id: string;
  name: string;
  domain: string;
  careersUrl: string | null;
  websiteUrl: string | null;
}

export interface CompanyCheckResult {
  company: CompanyForEvidence;
  discovery: DiscoveryResult;
  /** Null when no page was worth sending to the model. */
  extraction: ExtractionResult | null;
  rows: NewEligibilityEvidence[];
  status: CompanyEvidenceStatus;
}

export interface CheckOptions extends ExtractOptions {
  transport?: Transport;
  lookup?: HostLookup;
}

/** Explicit columns: the check must not depend on columns a migration may not have added yet. */
export async function loadCompanyForEvidence(
  db: Db,
  companyId: string,
): Promise<(CompanyForEvidence & { isDemo: boolean }) | null> {
  const [row] = await db
    .select({
      id: companies.id,
      name: companies.name,
      domain: companies.domain,
      careersUrl: companies.careersUrl,
      websiteUrl: companies.websiteUrl,
      isDemo: companies.isDemo,
    })
    .from(companies)
    .where(eq(companies.id, companyId));
  if (!row?.domain) return null;
  return { ...row, domain: normalizeDomain(row.domain) };
}

/** Discovery and extraction; writes nothing. Throws AI errors (cap, call, invalid output). */
export async function checkCompany(
  company: CompanyForEvidence,
  options: CheckOptions,
): Promise<CompanyCheckResult> {
  const discovery = await discoverCompanyPages(
    { domain: company.domain, hintUrls: [company.careersUrl, company.websiteUrl] },
    {
      ...(options.signal ? { signal: options.signal } : {}),
      ...(options.transport ? { transport: options.transport } : {}),
      ...(options.lookup ? { lookup: options.lookup } : {}),
    },
  );
  if (discovery.pages.length === 0) {
    return {
      company,
      discovery,
      extraction: null,
      rows: [],
      status: discovery.fetchFailed ? "fetch-failed" : "none",
    };
  }
  const extraction = await extractCompanyEvidence(company, discovery.pages, options);
  const rows = statementsToEvidenceRows(extraction.kept, {
    companyId: company.id,
    extractorVersion: extraction.promptVersion,
  });
  return { company, discovery, extraction, rows, status: rows.length > 0 ? "found" : "none" };
}

/**
 * Replaces the company's careers-page evidence and stamps the check. A `fetch-failed` check keeps
 * the previous rows (a site outage is not evidence that the policy changed) and only stamps.
 */
export async function persistCompanyEvidence(db: Db, result: CompanyCheckResult): Promise<void> {
  const companyId = result.company.id;
  await db.transaction(async (tx) => {
    if (result.status !== "fetch-failed") {
      await tx
        .delete(eligibilityEvidence)
        .where(
          and(
            eq(eligibilityEvidence.companyId, companyId),
            eq(eligibilityEvidence.subject, "company"),
            eq(eligibilityEvidence.source, "careers_page"),
          ),
        );
      if (result.rows.length > 0) await tx.insert(eligibilityEvidence).values(result.rows);
    }
    await tx
      .update(companies)
      .set({ evidenceCheckedAt: sql`now()`, evidenceStatus: result.status })
      .where(eq(companies.id, companyId));
  });
}
