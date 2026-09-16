import { appEnv } from "@/lib/env";
import { getProductAccess } from "@/lib/auth/session";
import { DISPLAY_NAME_MAX, getDisplayName, setDisplayName } from "@/lib/profile";
import type { ProfileResponse } from "@/lib/profile";

async function authorize(request: Request) {
  const access = await getProductAccess(request.headers);
  if (access.status === "unauthenticated") {
    return { error: Response.json({ error: "unauthenticated" }, { status: 401 }) };
  }
  if (access.status === "forbidden") {
    return { error: Response.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { session: access.session };
}

export async function GET(request: Request): Promise<Response> {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  const body: ProfileResponse = { displayName: await getDisplayName(auth.session.user.id) };
  return Response.json(body);
}

export async function PATCH(request: Request): Promise<Response> {
  const auth = await authorize(request);
  if (auth.error) return auth.error;

  const input: unknown = await request.json().catch(() => null);
  const raw =
    input && typeof input === "object" && "displayName" in input ? input.displayName : undefined;
  if (typeof raw !== "string") {
    return Response.json({ error: "invalid_display_name" }, { status: 400 });
  }
  const displayName = raw.trim();
  if (displayName.length === 0 || displayName.length > DISPLAY_NAME_MAX) {
    return Response.json({ error: "invalid_display_name" }, { status: 400 });
  }

  // Proof hook for optimistic rollback: outside production, a name containing "fail" errors.
  if (appEnv() !== "production" && displayName.toLowerCase().includes("fail")) {
    return Response.json({ error: "forced_failure" }, { status: 500 });
  }

  let saved: ProfileResponse | null;
  try {
    saved = await setDisplayName(auth.session.user.id, displayName);
  } catch (error) {
    // 23503: the user row was deleted (claimed) while this write waited on it.
    if (error instanceof Error && "code" in error && error.code === "23503") saved = null;
    else throw error;
  }
  if (!saved) return Response.json({ error: "unauthenticated" }, { status: 401 });
  return Response.json(saved);
}
