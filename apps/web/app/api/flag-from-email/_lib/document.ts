// The small standalone page `/api/flag-from-email` answers with.
//
// **Why a route handler renders HTML at all.** The link has to be a GET — an email cannot post a
// form, and Gmail strips one that tries — and a GET must not write anything, so the link lands on
// a page that asks the question and posts the answer. That page has no session, is reached once,
// and is never navigated to from inside the app, so it is served from the route rather than added
// to the App Router: one URL, two methods, no client bundle, and nothing for a crawler to index.
//
// It is a browser and not an inbox, so unlike the email template this may use a `<style>` block,
// custom properties and a dark-mode media query — and it does, because DESIGN.md's token-swap rule
// is exactly what a self-contained page can honour cheaply. What it cannot have is the app's web
// fonts, so both stacks name the real family first and fall back to a system grotesk and a system
// monospace, keeping the two voices whatever is installed.
//
// Nothing here writes a sentence: every string arrives from the caller, which reads it from
// `messages/en/delivery.json` or from `@pemby/core`'s delivery table.

/** `&` first, or the escaping eats itself. Attributes are quoted, so quotes go too. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export interface DocumentChoice {
  /** The `reason` value posted back. Always from a fixed list; never typed by anyone. */
  value: string;
  label: string;
}

export interface DocumentSpec {
  title: string;
  heading: string;
  lead: string;
  /** Rendered as the buttons of a single POST form. Empty on every terminal state. */
  choices?: DocumentChoice[];
  /** Where the form posts. Required when there are choices. */
  action?: string;
  /** A quieter line under the choices. */
  note?: string;
  /** The way out, always present. */
  linkHref: string;
  linkLabel: string;
}

const STYLE = `
:root{
  --ground:#faf6f0;--ink:#14110d;--ink-soft:#3b342b;--paper:#fbf8f2;
  --line:rgb(20 17 13 / 0.28);--line-strong:#14110d;--field:#2b3323;--on-field:#f7f1e6;
  color-scheme:light;
}
@media (prefers-color-scheme:dark){
  :root{
    --ground:#191510;--ink:#f7f1e6;--ink-soft:#ddd4c6;--paper:#211c16;
    --line:rgb(247 241 230 / 0.34);--line-strong:#f7f1e6;--field:#272d20;
    color-scheme:dark;
  }
}
*,*::before,*::after{box-sizing:border-box}
body{
  margin:0;min-height:100dvh;padding:48px 16px 64px;background:var(--ground);color:var(--ink);
  font-family:"Source Code Pro",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  font-size:15px;line-height:1.6;-webkit-font-smoothing:antialiased;
}
main{max-width:600px;margin:0 auto}
.wordmark{
  margin:0 0 18px 6px;font-family:"Rethink Sans",ui-sans-serif,system-ui,sans-serif;
  font-size:29px;font-weight:800;letter-spacing:-0.035em;line-height:1;
}
.card{
  background:var(--paper);border:1.5px solid var(--line-strong);border-radius:30px;
  padding:40px 32px 32px;
}
h1{
  margin:0 0 16px;max-width:18ch;font-family:"Rethink Sans",ui-sans-serif,system-ui,sans-serif;
  font-size:2.125rem;font-weight:700;line-height:0.92;letter-spacing:-0.035em;text-wrap:balance;
}
p{margin:0 0 16px;color:var(--ink-soft)}
form{display:grid;gap:0;margin:24px 0 0}
button{
  display:block;width:100%;min-height:56px;padding:12px 4px;border:0;
  border-top:1px solid var(--line);background:transparent;color:var(--ink);
  font:inherit;font-size:1.0625rem;text-align:left;cursor:pointer;
  transition:padding-left 160ms cubic-bezier(0.16,1,0.3,1);
}
button:last-of-type{border-bottom:1px solid var(--line)}
button:hover{padding-left:10px}
:focus-visible{outline:2px solid var(--field);outline-offset:3px}
.note{margin:24px 0 0;font-size:13px}
.out{margin:28px 0 0;padding-top:20px;border-top:1px solid var(--line);font-size:13px}
a{color:inherit;text-underline-offset:0.22em}
@media (prefers-reduced-motion:reduce){button{transition:none}button:hover{padding-left:4px}}
`;

export function renderDocument(spec: DocumentSpec): string {
  const choices = spec.choices ?? [];
  const form =
    choices.length > 0 && spec.action
      ? `<form method="post" action="${escapeHtml(spec.action)}">` +
        choices
          .map(
            (choice) =>
              `<button type="submit" name="reason" value="${escapeHtml(choice.value)}">` +
              `${escapeHtml(choice.label)}</button>`,
          )
          .join("") +
        `</form>`
      : "";

  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="robots" content="noindex,nofollow">` +
    `<title>${escapeHtml(spec.title)}</title><style>${STYLE}</style></head>` +
    `<body><main>` +
    `<p class="wordmark">Pemby</p>` +
    `<div class="card">` +
    `<h1>${escapeHtml(spec.heading)}</h1>` +
    `<p>${escapeHtml(spec.lead)}</p>` +
    form +
    (spec.note ? `<p class="note">${escapeHtml(spec.note)}</p>` : "") +
    `<p class="out"><a href="${escapeHtml(spec.linkHref)}">${escapeHtml(spec.linkLabel)}</a></p>` +
    `</div></main></body></html>`
  );
}

/** Personal data is never cached by any hop, and nothing here may be indexed. */
export function htmlResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
