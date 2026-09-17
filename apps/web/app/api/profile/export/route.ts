import { loadExport } from "../_lib/db";
import { authorize, isAnonymous } from "../_lib/http";

/**
 * `GET /api/profile/export` — "Export my data" on `/profile`. A JSON file built server-side from
 * the caller's own rows: their account, their profile, and one entry per CV with its metadata and
 * the profile parsed out of it.
 *
 * Never in the file: bucket keys or any bucket URL (CV objects are private and no presigned URL is
 * handed to a browser), and the raw extracted CV text.
 */
export async function GET(request: Request): Promise<Response> {
  const auth = await authorize(request);
  if (auth.error) return auth.error;

  const data = await loadExport(auth.session.user.id, isAnonymous(auth.session));
  const day = data.exportedAt.slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="pemby-data-${day}.json"`,
      "Cache-Control": "no-store",
      // The file is the user's own data; nothing about it should be sniffed or framed elsewhere.
      "X-Content-Type-Options": "nosniff",
    },
  });
}
