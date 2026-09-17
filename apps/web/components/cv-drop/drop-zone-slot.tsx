import { connection } from "next/server";
import { Suspense } from "react";
import { DropZone } from "@/components/landing/drop-zone";
import { cvDropEnabled } from "@/lib/cv/feature";
import { DropZonePlaceholder } from "./drop-zone-placeholder";

/**
 * Build-time switch, inlined by `next build` (a literal `process.env.NEXT_PUBLIC_*` reference is
 * replaced at build). Set to `true` only where the CV drop can be on; with it unset the landing page
 * keeps no request-time branch at all and stays prerendered. It decides which branch is *built*,
 * never whether the drop works: `cvDropEnabled()` on the server stays the authority, here and in the
 * API routes, so a stale public flag cannot switch the feature on.
 */
const BUILT_WITH_CV_DROP = process.env.NEXT_PUBLIC_CV_DROP_ENABLED === "true";

/** `next dev` prerenders nothing, so development always takes the request-time branch. */
const DEVELOPMENT = process.env.NODE_ENV !== "production";

// Read through a variable so the site key is not inlined at build: staging and production use
// different keys and the same build can be promoted between them.
const SITE_KEY_VAR = "NEXT_PUBLIC_TURNSTILE_SITE_KEY";

/**
 * The landing's drop zone: the stand-in wherever the CV drop is off, the working drop where the
 * server says it is on. Where it can be on, the decision is made per request inside a `Suspense`
 * boundary whose fallback is the inert placeholder, laid out from the working zone's own markup, so
 * the rest of the landing page still streams at once and nothing below the zone moves when the
 * decision arrives.
 *
 * `resume`: this instance picks up the tab's latest CV after a reload. Only one instance per page
 * should resume (the hero), or the same CV would show twice.
 */
export function DropZoneSlot({
  className,
  resume = false,
}: {
  className?: string;
  resume?: boolean;
}) {
  if (!BUILT_WITH_CV_DROP && !DEVELOPMENT) return <DropZone className={className} />;
  return (
    <Suspense fallback={<DropZonePlaceholder className={className} />}>
      <LiveGate className={className} resume={resume} />
    </Suspense>
  );
}

async function LiveGate({ className, resume }: { className?: string; resume: boolean }) {
  await connection();
  if (!cvDropEnabled()) return <DropZone className={className} />;
  const siteKey = process.env[SITE_KEY_VAR];
  if (!siteKey) {
    console.error(`cv drop: ${SITE_KEY_VAR} is not set; showing the stand-in`);
    return <DropZone className={className} />;
  }
  return <DropZone className={className} live={{ siteKey, resume }} />;
}
