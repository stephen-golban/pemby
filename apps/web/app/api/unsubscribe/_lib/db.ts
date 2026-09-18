// Database side of `/api/unsubscribe`. Raw SQL on the shared pool for the reason the header of
// `app/api/brief/_lib/db.ts` gives: pnpm resolves a second `drizzle-orm` copy for `apps/web`, so
// the query helpers in `@pemby/db` — written against that builder — are not reachable from here.
// Table and column names are the ones in `packages/db/src/schema/delivery.ts`.

import { getDb } from "@pemby/db";

/**
 * Switch off one email channel, for one user.
 *
 * Both halves of the `where` matter. The channel id comes from a signed token, so it is already
 * this user's channel; re-stating `user_id` means a signing bug can never reach across accounts,
 * and `type = 'email'` means a token minted for the inbox can never silence Telegram or push —
 * the link says "stop these emails" and this is what makes that sentence exact.
 *
 * `enabled` and not `dead_at`: this is the user's own switch, which is what
 * `packages/db/src/schema/delivery.ts` reserves `enabled` for.
 *
 * Returns whether a row changed, which the route deliberately does not pass on to the caller.
 */
export async function disableEmailChannel(channelId: string, userId: string): Promise<boolean> {
  const { rowCount } = await getDb().$client.query(
    `update channels
        set enabled = false, updated_at = now()
      where id = $1 and user_id = $2 and type = 'email'`,
    [channelId, userId],
  );
  return (rowCount ?? 0) > 0;
}
