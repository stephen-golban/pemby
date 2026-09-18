// Response helpers for `/api/channels/*`. The session check is the profile routes' own
// `authorize` — one owner gate, one place — and only the error vocabulary is local, because the
// codes a settings page can show are not the codes a profile page can.

import { authorize, json } from "@/app/api/profile/_lib/http";
import type { ChannelError } from "./view";

export { authorize, json };

export function fail(error: ChannelError, status: number): Response {
  return json({ error }, status);
}
