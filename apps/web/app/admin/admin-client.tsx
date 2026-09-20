"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type {
  AdminAutomatedActionRow,
  AdminBoardRow,
  AdminDeliveryFailureRow,
  AdminFlagRow,
  AdminQuarantinedJobRow,
  AdminPanel,
  AdminSourceHealth,
  AdminSpend,
  AdminView,
} from "@/app/api/admin/_lib/view";
import { ValueChips } from "@/app/profile/_shared/fields";
import panels from "@/app/profile/_shared/panels.module.css";
import { useAdmin, type AdminController } from "./_shared/use-admin";
import styles from "./admin.module.css";

/**
 * `/admin` — the owner's view of what is in the database right now (PLAN D26, D18).
 *
 * Five panels: flags waiting on a decision, jobs held out of every send, today's AI spend against
 * the cap, board health, and failed deliveries. Server shell then client component, like /brief and
 * /profile; `useAdmin` takes over from the first paint.
 *
 * **Seeded rows are shown and stamped, never dropped.** `is_demo` exists on three tables and the
 * seed writes demo rows into every other one, so the `@pemby/db` admin helpers carry `isDemo` on
 * each row and leave the decision here (`packages/db/src/queries/admin.ts:9`). Dropping them would
 * leave three empty panels on staging with no way to tell "nothing happened" from "nothing is
 * shown"; showing them unmarked would let a fictional row read as a real one. So: shown, stamped.
 */
export function AdminClient({ initial }: { initial: AdminView }) {
  const t = useTranslations("Admin");
  const admin = useAdmin(initial);

  if (admin.failed) {
    return (
      <div className={styles.column}>
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>{t("loadFailed.title")}</p>
          <p className={styles.emptyBody}>{t("loadFailed.body")}</p>
          <p>
            <button type="button" className={styles.pill} onClick={admin.retry}>
              {t("loadFailed.retry")}
            </button>
          </p>
        </div>
      </div>
    );
  }

  const view = admin.view;
  return (
    <div className={styles.column} data-pending={admin.pending ? "true" : undefined}>
      <header className={styles.intro}>
        <h1 className={styles.title}>{t("title")}</h1>
        <p className={styles.lead}>{t("lead")}</p>
        <div className={styles.meta}>
          <span>{t("readAt", { at: at(view.readAt) })}</span>
          <button type="button" className={styles.pill} onClick={admin.retry}>
            {admin.pending ? t("reading") : t("refresh")}
          </button>
        </div>
        <p className={styles.footnote}>{t("demoNote")}</p>
      </header>

      <ErrorLine admin={admin} />
      <FlagsPanel
        rows={view.flags}
        failed={failed(view, "flags")}
        canRelease={view.releaseAvailable}
        onAction={admin.actionFlag}
      />
      <AutomatedPanel
        rows={view.automatedActions}
        days={view.automatedWindowDays}
        failed={failed(view, "automatedActions")}
        canRelease={view.releaseAvailable}
        onAction={admin.actionFlag}
      />
      <QuarantinePanel
        rows={view.quarantined}
        failed={failed(view, "quarantined")}
        onRelease={admin.actionJob}
      />
      <SpendPanel spend={view.spend} failed={failed(view, "spend")} />
      <BoardsPanel source={view.source} failed={failed(view, "source")} />
      <DeliveryPanel
        rows={view.deliveryFailures}
        days={view.deliveryWindowDays}
        failed={failed(view, "deliveryFailures")}
      />
    </div>
  );
}

/** Whether this panel's read threw. An unreadable panel never renders the "nothing here" copy. */
function failed(view: AdminView, name: AdminPanel): boolean {
  return view.failedPanels.includes(name);
}

// Formatting ---------------------------------------------------------------
//
// Fixed to UTC, not to the reader's zone: the cost cap is a UTC-day cap, every stored timestamp is
// UTC, and a fixed zone also makes the server's first paint and the client's re-render produce the
// same string. An operations page wants the timestamp the database would print.

const stamp = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const counter = new Intl.NumberFormat("en-GB");

function at(iso: string): string {
  return `${stamp.format(new Date(iso))} UTC`;
}

/** Four decimals under a dollar: a day's real spend is cents, and `$0.02` hides most of it. */
function money(usd: number): string {
  return `$${usd.toFixed(usd !== 0 && Math.abs(usd) < 1 ? 4 : 2)}`;
}

// Shared pieces ------------------------------------------------------------

function ErrorLine({ admin }: { admin: AdminController }) {
  const t = useTranslations("Admin.errors");
  if (!admin.error) return null;
  return (
    <p className={styles.error} role="alert">
      <span>{t(admin.error)}</span>
      <button type="button" className={styles.pill} onClick={admin.clearError}>
        {t("dismiss")}
      </button>
    </p>
  );
}

function Panel({
  title,
  count,
  lead,
  children,
}: {
  title: string;
  count?: string;
  lead: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <div className={styles.panelTitleRow}>
          <h2 className={styles.panelTitle}>{title}</h2>
          {count ? <span className={styles.panelCount}>{count}</span> : null}
        </div>
        <p className={styles.panelLead}>{lead}</p>
      </div>
      {children}
    </section>
  );
}

/**
 * The empty state, which on this page is load-bearing rather than decorative: two of the five
 * panels have no rows on staging and cannot get any, so each one says in its own words that it is
 * answering "none" — the alternative is a blank panel that reads exactly like a broken query.
 */
function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className={styles.empty}>
      <p className={styles.emptyTitle}>{title}</p>
      <p className={styles.emptyBody}>{body}</p>
    </div>
  );
}

/**
 * A panel whose read threw.
 *
 * Deliberately not the empty state and deliberately not silence: on a page whose entire job is to
 * say what is in the database, "the query failed" and "the answer is none" have to read completely
 * differently, or the owner reads a broken panel as good news.
 */
function Unreadable() {
  const t = useTranslations("Admin");
  return (
    <p className={styles.error} role="status">
      {t("panelFailed")}
    </p>
  );
}

/** The synthetic-content marker (DESIGN.md). Fixed colours, and never only a colour. */
function Stamp() {
  const t = useTranslations("Admin");
  return (
    <span className={styles.stamp}>
      {t("example")}
      <span className="visually-hidden"> — {t("exampleTitle")}</span>
    </span>
  );
}

function Facts({ children }: { children: ReactNode }) {
  return <ul className={styles.facts}>{children}</ul>;
}

function Tag({ tone, children }: { tone?: "alert" | "watch" | "good"; children: ReactNode }) {
  return (
    <span className={styles.tag}>
      <span className={styles.dot} data-tone={tone} aria-hidden="true" />
      {children}
    </span>
  );
}

// 1. Flags -----------------------------------------------------------------

function FlagsPanel({
  rows,
  failed: unreadable,
  canRelease,
  onAction,
}: {
  rows: AdminFlagRow[];
  failed: boolean;
  canRelease: boolean;
  onAction: AdminController["actionFlag"];
}) {
  const t = useTranslations("Admin.flags");
  return (
    <Panel
      title={t("title")}
      count={rows.length > 0 ? t("count", { count: rows.length }) : undefined}
      lead={t("lead")}
    >
      {unreadable ? (
        <Unreadable />
      ) : rows.length === 0 ? (
        <Empty title={t("emptyTitle")} body={t("emptyBody")} />
      ) : (
        <div className={styles.ledger}>
          {rows.map((row) => (
            <FlagRow key={row.flagId} row={row} canRelease={canRelease} onAction={onAction} />
          ))}
        </div>
      )}
    </Panel>
  );
}

function FlagRow({
  row,
  canRelease,
  onAction,
}: {
  row: AdminFlagRow;
  canRelease: boolean;
  onAction: AdminController["actionFlag"];
}) {
  const t = useTranslations("Admin.flags");
  // `gave-up` is the one value that means the row needs a decision rather than patience: the rules
  // tried and stopped. `claimed` past the stale cutoff is a crashed worker, not live work.
  const tone =
    row.automation === "gave-up" ? "alert" : row.automation === "claimed" ? "watch" : undefined;

  return (
    <div className={styles.row}>
      <div className={styles.rowBody}>
        <p className={styles.rowTitle}>{row.jobTitle}</p>
        <Facts>
          <li className={styles.factStrong}>{t(`reason.${row.reason}`)}</li>
          <li>{row.companyName}</li>
          <li>{t(`status.${row.status}`)}</li>
          <li>{t("weight", { weight: row.weight })}</li>
          <li>{t("filed", { at: at(row.createdAt) })}</li>
          {row.country ? (
            <li>
              {t("country")} {row.country}
            </li>
          ) : null}
          {row.field ? (
            <li>
              {t(`fieldName.${row.field}`)}: {row.fieldValue ?? t("noFieldValue")}
            </li>
          ) : null}
          {row.actionTaken ? <li>{t(`action.${row.actionTaken}`)}</li> : null}
        </Facts>
        <Facts>
          <li>
            <Tag tone={tone}>{t(`automation.${row.automation}`)}</Tag>
          </li>
          {row.claimAttempts > 0 ? (
            <li>{t("automation.attempts", { count: row.claimAttempts })}</li>
          ) : null}
          {row.isDemo ? (
            <li>
              <Stamp />
            </li>
          ) : null}
        </Facts>
        {row.automation === "claimed" ? (
          <p className={styles.footnote}>{t("automation.claimedHelp")}</p>
        ) : null}
        {row.note ? (
          <p className={styles.note}>
            <span className={styles.noteLabel}>{t("note")}</span>
            {row.note}
          </p>
        ) : null}
        {row.note ? <p className={styles.footnote}>{t("noteNever")}</p> : null}
        {row.actionable ? null : <p className={styles.footnote}>{t("readOnlyWhy")}</p>}
        {row.actionable ? (
          <p className={styles.footnote}>
            {row.evidenceRows === 0
              ? t("evidenceNone")
              : row.evidenceRows === 1
                ? t("evidenceOne")
                : t("evidenceSome", { count: row.evidenceRows })}
          </p>
        ) : null}
        {row.actionable && row.jobQuarantined ? (
          <p className={styles.footnote}>
            {t("heldNote")}
            {canRelease ? "" : ` ${t("releaseUnavailable")}`}
          </p>
        ) : null}
      </div>
      <div className={styles.rowActions}>
        <a className={styles.pill} href={row.jobUrl} target="_blank" rel="noreferrer noopener">
          {t("openPost")}
        </a>
        {row.actionable ? (
          <>
            <button
              type="button"
              className={styles.pill}
              title={t("approveHelp")}
              onClick={() => onAction({ flagId: row.flagId, action: "approve" })}
            >
              {t("approve")}
            </button>
            <button
              type="button"
              className={styles.pill}
              title={t("dismissHelp")}
              onClick={() => onAction({ flagId: row.flagId, action: "dismiss" })}
            >
              {t("dismiss")}
            </button>
            {row.jobQuarantined && canRelease ? (
              <button
                type="button"
                className={styles.pill}
                title={t("dismissReleaseHelp")}
                onClick={() => onAction({ flagId: row.flagId, action: "dismiss", release: true })}
              >
                {t("dismissRelease")}
              </button>
            ) : null}
          </>
        ) : (
          <Tag tone="watch">{t("readOnly")}</Tag>
        )}
      </div>
    </div>
  );
}

// 2. What the rules did on their own ---------------------------------------

/**
 * A log, not a queue, and kept apart from the queue above on purpose.
 *
 * "You must decide this" and "we already did this, look if you want" are different jobs. Merging
 * them makes the first one worse: the finished rows outnumber the waiting ones and bury them. So
 * this is its own panel, with its own heading, and nothing in it is presented as outstanding.
 *
 * What it is for: three of these actions changed a real company's business with nobody in the loop
 * — a post closed for everyone, a post held out of every send, a company's tier stepped down on the
 * strength of user flags. Until this panel existed there was no screen anywhere on which they
 * appeared.
 */
function AutomatedPanel({
  rows,
  days,
  failed: unreadable,
  canRelease,
  onAction,
}: {
  rows: AdminAutomatedActionRow[];
  days: number;
  failed: boolean;
  canRelease: boolean;
  onAction: AdminController["actionFlag"];
}) {
  const t = useTranslations("Admin.automated");
  return (
    <Panel
      title={t("title")}
      count={rows.length > 0 ? t("count", { count: rows.length }) : undefined}
      lead={t("lead")}
    >
      {unreadable ? (
        <Unreadable />
      ) : rows.length === 0 ? (
        <Empty title={t("emptyTitle")} body={t("emptyBody")} />
      ) : (
        <div className={styles.ledger}>
          {rows.map((row) => (
            <AutomatedRow key={row.flagId} row={row} canRelease={canRelease} onAction={onAction} />
          ))}
        </div>
      )}
      {/* The invariant half of the undo explanation lives here, once, rather than repeating on
          every row: a log can run to dozens of entries and the same three sentences under each of
          them is noise, not care. What stays on a row is only what differs between rows. */}
      <p className={styles.footnote}>
        {t("window", { days })} {t("heavyNote")} {t("undoNote")}
      </p>
    </Panel>
  );
}

function AutomatedRow({
  row,
  canRelease,
  onAction,
}: {
  row: AdminAutomatedActionRow;
  canRelease: boolean;
  onAction: AdminController["actionFlag"];
}) {
  const t = useTranslations("Admin.automated");
  const tf = useTranslations("Admin.flags");
  // The consequence in words, because `auto_resolved / tier_downgraded` is a database row and
  // "this company's tier was lowered for everyone in MD" is what actually happened.
  const consequence =
    row.actionTaken === "tier_downgraded" && row.country
      ? t("consequence.tier_downgraded_country", { country: row.country })
      : t(`consequence.${row.actionTaken}`);

  return (
    <div className={styles.row}>
      <div className={styles.rowBody}>
        <p className={styles.rowTitle}>{row.jobTitle}</p>
        <p className={styles.note}>{consequence}</p>
        <Facts>
          {row.heavy ? (
            <li>
              <Tag tone="alert">{t("heavy")}</Tag>
            </li>
          ) : null}
          <li className={styles.factStrong}>{tf(`reason.${row.reason}`)}</li>
          <li>{row.companyName}</li>
          <li>{t("weight", { weight: row.weight })}</li>
          <li className={styles.factStrong}>{t("decided", { at: at(row.resolvedAt) })}</li>
          <li>{t("filed", { at: at(row.createdAt) })}</li>
          {row.isDemo ? (
            <li>
              <Stamp />
            </li>
          ) : null}
        </Facts>
        {row.undoable ? (
          <p className={styles.footnote}>
            {/* An outcome, not an intention: with no evidence rows left, "withdraws this flag's
                evidence" describes work that will not happen. The count comes from the kernel. */}
            {row.evidenceRows === 0
              ? t("undoSaysNone")
              : row.evidenceRows === 1
                ? t("undoSaysOne")
                : t("undoSays", { count: row.evidenceRows })}
            {row.jobQuarantined
              ? ` ${canRelease ? t("undoQuarantine") : t("undoReleaseUnavailable")}`
              : ""}
          </p>
        ) : null}
      </div>
      <div className={styles.rowActions}>
        <a className={styles.pill} href={row.jobUrl} target="_blank" rel="noreferrer noopener">
          {t("openPost")}
        </a>
        {row.undoable ? (
          <>
            <button
              type="button"
              className={styles.pill}
              onClick={() => onAction({ flagId: row.flagId, action: "dismiss" })}
            >
              {t("undo")}
            </button>
            {row.jobQuarantined && canRelease ? (
              <button
                type="button"
                className={styles.pill}
                onClick={() => onAction({ flagId: row.flagId, action: "dismiss", release: true })}
              >
                {t("undoRelease")}
              </button>
            ) : null}
          </>
        ) : (
          <Tag tone="watch">{t("readOnly")}</Tag>
        )}
      </div>
    </div>
  );
}

// 3. Quarantined jobs ------------------------------------------------------

function QuarantinePanel({
  rows,
  failed: unreadable,
  onRelease,
}: {
  rows: AdminQuarantinedJobRow[];
  failed: boolean;
  onRelease: AdminController["actionJob"];
}) {
  const t = useTranslations("Admin.quarantine");
  // The reason words are the flag panel's, read from there rather than copied into this namespace:
  // one spelling of "Doesn't hire from my country" on the page, not two that can drift.
  const tf = useTranslations("Admin.flags");
  return (
    <Panel
      title={t("title")}
      count={rows.length > 0 ? t("count", { count: rows.length }) : undefined}
      lead={t("lead")}
    >
      {unreadable ? (
        <Unreadable />
      ) : rows.length === 0 ? (
        <Empty title={t("emptyTitle")} body={t("emptyBody")} />
      ) : (
        <div className={styles.ledger}>
          {rows.map((row) => (
            <div className={styles.row} key={row.jobId}>
              <div className={styles.rowBody}>
                <p className={styles.rowTitle}>{row.title}</p>
                <Facts>
                  <li>{row.companyName}</li>
                  <li className={styles.factStrong}>
                    {row.flagCount > 0
                      ? t("flags", { count: row.flagCount, weight: row.flagWeight })
                      : t("noFlags")}
                  </li>
                  <li>{t("heldAt", { at: at(row.updatedAt) })}</li>
                  <li>{t("firstSeen", { at: at(row.firstSeenAt) })}</li>
                  {row.isDemo ? (
                    <li>
                      <Stamp />
                    </li>
                  ) : null}
                </Facts>
                <p className={styles.footnote}>
                  {t("heldMeans")}
                  {row.releasable ? "" : ` ${t("releaseUnavailableWhy")}`}
                </p>
                {row.flagReasons.length > 0 ? (
                  <ValueChips
                    label={t("reasonsLabel")}
                    values={row.flagReasons.map((reason) => tf(`reason.${reason}`))}
                  />
                ) : null}
              </div>
              <div className={styles.rowActions}>
                <a className={styles.pill} href={row.url} target="_blank" rel="noreferrer noopener">
                  {t("openPost")}
                </a>
                {row.releasable ? (
                  <button
                    type="button"
                    className={styles.pill}
                    title={t("releaseHelp")}
                    onClick={() => onRelease({ jobId: row.jobId, action: "release" })}
                  >
                    {t("release")}
                  </button>
                ) : (
                  <Tag tone="alert">{t("releaseUnavailable")}</Tag>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

// 4. AI spend --------------------------------------------------------------

function SpendPanel({ spend, failed: unreadable }: { spend: AdminSpend; failed: boolean }) {
  const t = useTranslations("Admin.spend");
  const share =
    spend.capUsd !== null && spend.capUsd > 0
      ? Math.min(100, (spend.spentUsd / spend.capUsd) * 100)
      : null;

  if (unreadable) {
    return (
      <Panel title={t("title")} lead={t("lead", { day: spend.day })}>
        <Unreadable />
      </Panel>
    );
  }

  return (
    <Panel title={t("title")} lead={t("lead", { day: spend.day })}>
      <div className={styles.spendFigure}>
        <p className={panels.metric}>{money(spend.spentUsd)}</p>
        {spend.capUsd !== null ? (
          <p className={styles.spendCap}>
            {t("of", { cap: money(spend.capUsd) })}
            {share === null
              ? ""
              : ` · ${t("share", { percent: share.toFixed(share < 1 ? 2 : 1) })}`}
          </p>
        ) : null}
        <p className={styles.spendCap}>{t("calls", { count: counter.format(spend.calls) })}</p>
      </div>
      {share === null ? null : (
        <div
          className={panels.track}
          role="meter"
          aria-valuenow={Math.round(share)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t("title")}
        >
          <div className={panels.fill} style={{ inlineSize: `${Math.max(share, 0.5)}%` }} />
        </div>
      )}
      {spend.capError ? <p className={styles.error}>{t("capUnreadable")}</p> : null}
      {spend.userKeyUsd > 0 ? (
        <p className={styles.footnote}>{t("userKey", { amount: money(spend.userKeyUsd) })}</p>
      ) : null}

      {spend.byTask.length === 0 ? (
        <Empty title={t("emptyTitle")} body={t("emptyBody")} />
      ) : (
        <div className={styles.ledger}>
          <div className={`${styles.numberRow} ${styles.numberHead}`}>
            <span>{t("taskHead")}</span>
            <span className={styles.numeric}>{t("callsHead")}</span>
            <span className={styles.numeric}>{t("costHead")}</span>
          </div>
          {spend.byTask.map((row) => (
            <div className={styles.numberRow} key={row.task}>
              <span className={styles.taskName}>
                {row.task}
                {row.keyClasses.includes("user") ? <Tag>{t("userKeyTag")}</Tag> : null}
              </span>
              <span className={styles.numeric}>{counter.format(row.calls)}</span>
              <span className={styles.numeric}>{money(row.costUsd)}</span>
            </div>
          ))}
        </div>
      )}
      <p className={styles.footnote}>{t("footnote")}</p>
    </Panel>
  );
}

// 5. Source health ---------------------------------------------------------

function BoardsPanel({
  source,
  failed: unreadable,
}: {
  source: AdminSourceHealth;
  failed: boolean;
}) {
  const t = useTranslations("Admin.boards");
  const totals = source.totals;
  if (unreadable) {
    return (
      <Panel title={t("title")} lead={t("lead")}>
        <Unreadable />
      </Panel>
    );
  }
  return (
    <Panel title={t("title")} lead={t("lead")}>
      <dl className={styles.tally}>
        <div>
          <dt>{t("companies")}</dt>
          <dd>{counter.format(totals.companies)}</dd>
        </div>
        <div>
          <dt>{t("openJobs")}</dt>
          <dd>{counter.format(totals.openJobs)}</dd>
        </div>
        <div>
          <dt>{t("active")}</dt>
          <dd>{counter.format(totals.active)}</dd>
        </div>
        <div>
          <dt>{t("erroring")}</dt>
          <dd>{counter.format(totals.erroring)}</dd>
        </div>
        <div>
          <dt>{t("dead")}</dt>
          <dd>{counter.format(totals.dead)}</dd>
        </div>
        <div>
          <dt>{t("disabled")}</dt>
          <dd>{counter.format(totals.disabled)}</dd>
        </div>
      </dl>

      {source.needsAttention.length === 0 ? (
        <Empty title={t("emptyTitle")} body={t("emptyBody")} />
      ) : (
        <div className={styles.ledger}>
          {source.needsAttention.map((row) => (
            <BoardRow key={row.companyId} row={row} />
          ))}
        </div>
      )}
      <p className={styles.footnote}>
        {t("healthy", { count: counter.format(source.healthy) })}
        {source.truncated ? ` ${t("truncated")}` : ""}
      </p>
    </Panel>
  );
}

function BoardRow({ row }: { row: AdminBoardRow }) {
  const t = useTranslations("Admin.boards");
  const tone = row.concern === "erroring" || row.concern === "not-found" ? "alert" : "watch";
  return (
    <div className={styles.row}>
      <div className={styles.rowBody}>
        <p className={styles.rowTitle}>{row.companyName}</p>
        <Facts>
          <li>
            <Tag tone={tone}>{t(`concern.${row.concern}`)}</Tag>
          </li>
          <li>{row.ats}</li>
          <li>{t("openCount", { count: counter.format(row.jobsOpen) })}</li>
          <li>
            {row.lastSuccessAt
              ? t("lastSuccess", { at: at(row.lastSuccessAt) })
              : t("neverSucceeded")}
          </li>
          {row.totalErrors > 0 ? (
            <li>{t("errors", { consecutive: row.consecutiveErrors, total: row.totalErrors })}</li>
          ) : null}
          {row.lastErrorKind ? <li className={styles.factStrong}>{row.lastErrorKind}</li> : null}
        </Facts>
      </div>
      <div className={styles.rowActions} />
    </div>
  );
}

// 6. Delivery failures -----------------------------------------------------

function DeliveryPanel({
  rows,
  days,
  failed: unreadable,
}: {
  rows: AdminDeliveryFailureRow[];
  days: number;
  failed: boolean;
}) {
  const t = useTranslations("Admin.delivery");
  return (
    <Panel
      title={t("title")}
      count={rows.length > 0 ? t("count", { count: rows.length }) : undefined}
      lead={t("lead", { days })}
    >
      {unreadable ? (
        <Unreadable />
      ) : rows.length === 0 ? (
        <Empty title={t("emptyTitle")} body={t("emptyBody")} />
      ) : (
        <div className={styles.ledger}>
          {rows.map((row) => (
            <div className={styles.row} key={row.deliveryId}>
              <div className={styles.rowBody}>
                <p className={styles.rowTitle}>{row.jobTitle ?? t("noMatch")}</p>
                <Facts>
                  <li>
                    <Tag tone="alert">{t(`channel.${row.channelType}`)}</Tag>
                  </li>
                  {row.companyName ? <li>{row.companyName}</li> : null}
                  <li className={styles.factStrong}>{row.error ?? t("noError")}</li>
                  <li>{at(row.createdAt)}</li>
                  {row.isDemo ? (
                    <li>
                      <Stamp />
                    </li>
                  ) : null}
                </Facts>
              </div>
              <div className={styles.rowActions} />
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
