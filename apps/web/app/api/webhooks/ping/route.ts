// Stub that proves /api/webhooks/* is exempt from staging protection and the owner gate.
// Real webhooks verify signatures or secret tokens themselves.
export function POST(): Response {
  return Response.json({ ok: true });
}
