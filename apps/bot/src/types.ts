// The bot's context type, in one place so a plugin that widens it later widens it everywhere.
//
// Plain grammY `Context` today: nothing in this service needs sessions, conversations or a menu,
// and the handlers take their dependencies as an explicit argument rather than off the context, so
// there is nothing to hang on it.

import type { Context } from "grammy";

export type BotContext = Context;
