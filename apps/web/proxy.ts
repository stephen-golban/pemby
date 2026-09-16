import { createTranslator } from "next-intl";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkStagingBasicAuth } from "@/lib/access/basic-auth";
import { ownerGateEnabled } from "@/lib/access/owner-gate";
import { isApiRoute, isPublicRoute, isStagingAuthExempt } from "@/lib/access/paths";
import { getProductAccess } from "@/lib/auth/session";
import { appEnv } from "@/lib/env";
import { defaultLocale } from "@/i18n/config";
import messages from "@/messages/en.json";

// Next.js 16 request interception (formerly middleware). Runs on the Node.js runtime, so the owner
// gate validates the session against the database here. Product pages and route handlers repeat
// the check server-side (`getProductAccess`); this is the first filter, not the only one.
export async function proxy(request: NextRequest): Promise<Response> {
  const { pathname } = request.nextUrl;
  const t = createTranslator({ locale: defaultLocale, messages, namespace: "Proxy" });

  // 1. Staging password (phase 01 item 7). Fails closed when the credentials are not configured.
  if (appEnv() === "staging" && !isStagingAuthExempt(pathname)) {
    const result = checkStagingBasicAuth(request.headers.get("authorization"));
    if (result === "misconfigured") {
      return new NextResponse(t("unavailable"), { status: 503 });
    }
    if (result === "denied") {
      return new NextResponse(t("authRequired"), {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Pemby staging", charset="UTF-8"' },
      });
    }
  }

  // 2. Owner-only gate (phase 01 item 12).
  if (ownerGateEnabled() && !isPublicRoute(pathname)) {
    const access = await getProductAccess(request.headers);
    if (access.status !== "ok") {
      if (isApiRoute(pathname)) {
        const status = access.status === "unauthenticated" ? 401 : 403;
        return NextResponse.json({ error: access.status }, { status });
      }
      if (access.status === "unauthenticated") {
        return NextResponse.redirect(new URL("/sign-in", request.url));
      }
      return NextResponse.rewrite(new URL("/access-denied", request.url), { status: 403 });
    }
  }

  return NextResponse.next();
}

export const config = {
  // Everything except Next.js build assets and image optimization.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
