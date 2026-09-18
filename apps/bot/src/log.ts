// Logging that cannot leak a person.
//
// Every update this service handles is personal data: a chat id identifies one human being, and
// the message text is whatever they typed. Nothing here ever prints a chat id, a name, a username,
// message text, an email address or a token — only names and counts, which is the house style set
// by the private-config line in `index.ts`.

/**
 * A provider or driver error reduced to its constructor name and, when there is one, a SQLSTATE.
 *
 * Same shape and the same reason as `apps/worker/src/cv/workers.ts:16`: a `GrammyError` carries
 * Telegram's own `description`, and a Postgres error carries the failing row, so the *message* is
 * exactly the part that must not reach a log line. Drizzle re-throws a driver error with the
 * original on `cause`, so both places are checked.
 *
 * Duplicated rather than imported because `apps/bot` does not depend on `apps/worker` and nothing
 * in `@pemby/core` or `@pemby/db` exports it. See the report for the suggestion to move it.
 */
export function safeErrorLabel(error: unknown): string {
  const name = error instanceof Error ? (error.constructor.name ?? error.name) : "error";
  const codeOf = (value: unknown): string =>
    value && typeof value === "object" && "code" in value && typeof value.code === "string"
      ? value.code
      : "";
  const code = codeOf(error) || codeOf(error instanceof Error ? error.cause : undefined);
  return /^[A-Za-z0-9_]{1,12}$/.test(code) ? `${name}:${code}` : name;
}

/**
 * One line per handled update, with the outcome and nothing else.
 *
 * `what` is a fixed label the code chose ("start", "callback:save"), never anything that came off
 * the wire, so no user input can reach the log through it.
 */
export function logUpdate(what: string, outcome: string, ms: number): void {
  console.log(`bot ${what}: ${outcome} ms=${ms}`);
}
