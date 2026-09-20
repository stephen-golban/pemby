// Response helpers for `/api/openrouter/*`. The session check is the profile routes' own
// `authorize` — one owner gate, one place — and only the error vocabulary is local, exactly as
// `/api/channels/_lib/http.ts` does it.

import { authorize, json } from "@/app/api/profile/_lib/http";
import type { OpenRouterError } from "./view";

export { authorize, json };

export function fail(error: OpenRouterError, status: number): Response {
  return json({ error }, status);
}
