// The three places in the web app a chat message ever points at.
//
// Built once from the app's origin so no handler concatenates a path, and named after what the
// user is going to do there rather than after the route.

export interface BotLinks {
  /** The Brief: every live match, in one place. */
  brief: string;
  /** Delivery settings: connect Telegram, quiet hours, channels on and off. */
  settings: string;
  /**
   * Passes.
   *
   * `/pricing` is the route that exists (`apps/web/app/pricing`). Telegram requires Stars for
   * digital goods sold inside a chat, so the bot sells nothing and links out — no `sendInvoice`,
   * no Stars flow, anywhere in this service.
   */
  passes: string;
}

export function botLinks(appUrl: string): BotLinks {
  return {
    brief: `${appUrl}/brief`,
    settings: `${appUrl}/settings`,
    passes: `${appUrl}/pricing`,
  };
}
