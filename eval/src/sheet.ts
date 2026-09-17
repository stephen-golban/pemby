// Turn a candidates file into a self-contained local HTML labeling sheet.
//
//   pnpm --filter @pemby/eval eval:sheet candidates/session-1.json <out.html> [--prefill proposed.json]
//
// Write the sheet outside the repo (a scratchpad): it embeds post text and is a working file.
// The page runs from file:// with no network calls; choices autosave in the browser's localStorage.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { candidatesFileSchema } from "./schema";
import { EVAL_DIR, parseArgs, readJson, stringFlag } from "./util";

const CSS = `
:root { color-scheme: light dark; --bg:#f7f7f5; --card:#fff; --ink:#1b1b1b; --muted:#6b6b6b; --line:#dedcd6;
  --mark:#fff1a8; --focus:#2d5bd7; --green:#1f8a4c; --yellow:#b88700; --white:#7a7a7a; --red:#c0392b; }
@media (prefers-color-scheme: dark) { :root { --bg:#141414; --card:#1d1d1d; --ink:#ececec; --muted:#9a9a9a;
  --line:#333; --mark:#5a4b00; --focus:#7aa2ff; } }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--ink); font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif; }
.bar { position:sticky; top:0; z-index:5; background:var(--card); border-bottom:1px solid var(--line);
  padding:8px 16px; display:flex; flex-wrap:wrap; gap:8px 16px; align-items:center; }
.bar h1 { font-size:15px; margin:0; }
.bar .grow { flex:1; }
.bar button, dialog button { font:inherit; padding:4px 10px; border:1px solid var(--line); border-radius:6px;
  background:var(--bg); color:var(--ink); cursor:pointer; }
.bar details { position:relative; }
.bar details > div { position:absolute; right:0; top:28px; width:min(460px,90vw); background:var(--card);
  border:1px solid var(--line); border-radius:8px; padding:10px; display:grid; gap:6px; }
.bar textarea { width:100%; height:110px; font:12px ui-monospace,monospace; }
#help { font-size:12px; color:var(--muted); }
#help:not([open]) .keys { display:none; }
main { max-width:1080px; margin:0 auto; padding:12px 16px 50vh; display:grid; gap:12px; }
.card { background:var(--card); border:1px solid var(--line); border-left:4px solid var(--line); border-radius:8px;
  padding:10px 14px; scroll-margin-top:56px; outline:none; }
.card.current { border-left-color:var(--focus); }
.card.complete { border-left-color:var(--green); }
.card.current.complete { box-shadow:inset 3px 0 0 var(--focus); }
.card.skipped { opacity:.55; }
.card header { display:flex; gap:10px; align-items:baseline; flex-wrap:wrap; }
.card h2 { font-size:16px; margin:0; }
.num { color:var(--muted); font-variant-numeric:tabular-nums; }
.company { font-weight:600; color:var(--muted); }
.card header a { margin-left:auto; color:var(--focus); }
.meta { display:flex; flex-wrap:wrap; gap:4px 14px; color:var(--muted); font-size:12.5px; margin:4px 0 6px; }
.meta .bucket { color:var(--ink); background:var(--bg); border:1px solid var(--line); border-radius:4px; padding:0 6px; }
.spans { margin:4px 0 6px; padding-left:18px; }
.spans li { margin:2px 0; }
.spans b, .desc mark b { font-weight:650; }
.nospans { color:var(--muted); font-style:italic; margin:4px 0; }
details summary { cursor:pointer; color:var(--muted); font-size:12.5px; }
.desc { white-space:pre-wrap; font-size:13px; max-height:420px; overflow:auto; border:1px solid var(--line);
  border-radius:6px; padding:8px; margin-top:4px; }
.desc mark { background:var(--mark); color:inherit; }
table.pairs { border-collapse:collapse; margin-top:8px; }
table.pairs th { text-align:left; padding:2px 10px 2px 0; font-size:13px; }
.pair { padding:3px 14px 3px 4px; white-space:nowrap; border-radius:6px; }
.pair.cursor { outline:2px solid var(--focus); outline-offset:-1px; }
.way { display:inline-block; width:34px; color:var(--muted); font-size:12px; }
.seg { display:inline-flex; border:1px solid var(--line); border-radius:6px; overflow:hidden; vertical-align:middle; }
.opt input { position:absolute; opacity:0; pointer-events:none; }
.opt span { display:inline-block; width:28px; text-align:center; padding:2px 0; cursor:pointer; font-weight:600; font-size:12px; }
.opt + .opt span { border-left:1px solid var(--line); }
.opt.green input:checked + span { background:var(--green); color:#fff; }
.opt.yellow input:checked + span { background:var(--yellow); color:#fff; }
.opt.white input:checked + span { background:var(--white); color:#fff; }
.opt.red input:checked + span { background:var(--red); color:#fff; }
.flag { display:none; font-size:11px; color:var(--yellow); margin-left:4px; }
.pair.proposed .flag { display:inline; }
.pair.proposed .seg { border-style:dashed; border-color:var(--yellow); }
.pair.proposed input:checked + span { opacity:.55; }
.note { width:120px; margin-left:6px; font-size:12px; padding:1px 4px; border:1px solid var(--line); border-radius:4px;
  background:transparent; color:inherit; }
label.skip { display:inline-block; margin-top:6px; font-size:12.5px; color:var(--muted); }
dialog { width:min(900px,94vw); border:1px solid var(--line); border-radius:10px; background:var(--card); color:var(--ink); }
dialog textarea { width:100%; height:50vh; font:12px ui-monospace,monospace; }
@media (max-width: 640px) { .pair { display:block; } table.pairs th { vertical-align:top; } .note { width:90px; } }
`;

const BODY = `
<div class="bar">
  <h1>Eligibility labels · session __SESSION__</h1>
  <span id="progress"></span>
  <span class="grow"></span>
  <span id="help"><button type="button" onclick="this.parentNode.toggleAttribute('open')">Keys</button>
    <span class="keys">j/k post · h/l pair · g y w r (or 1-4) set tier and advance · a accept proposed · s skip · n note · d description · Esc leave note</span></span>
  <details><summary>Prefill</summary><div>
    <input id="prefill-file" type="file" accept="application/json,.json">
    <textarea id="prefill-text" placeholder='{"post-id": {"MD": {"b2b-contractor": "green", "eor-employee": "white"}}}'></textarea>
    <label><input id="prefill-confirmed" type="checkbox"> Mark as confirmed (reloading an export)</label>
    <button id="prefill-apply" type="button">Apply pasted prefill</button>
    <span id="prefill-status"></span>
  </div></details>
  <button id="export-open" type="button">Export labels</button>
  <button id="reset" type="button">Reset</button>
</div>
<main id="cards"></main>
<dialog id="export">
  <p id="export-summary"></p>
  <textarea id="export-text" readonly></textarea>
  <p><button id="export-download" type="button">Download JSON</button> <button id="export-copy" type="button">Copy</button>
  <button id="export-close" type="button">Close</button></p>
</dialog>
`;

/** JSON that is safe inside a <script> element. */
function scriptJson(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

async function main(): Promise<void> {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  const [input, output] = positional;
  if (!input || !output) {
    throw new Error("usage: sheet.ts <candidates.json> <out.html> [--prefill proposed.json]");
  }
  const outPath = path.resolve(output);
  if (outPath.startsWith(`${path.dirname(EVAL_DIR)}${path.sep}`)) {
    console.warn("warning: the sheet embeds post text; write it outside the repo (a scratchpad)");
  }
  const candidates = candidatesFileSchema.parse(await readJson(path.resolve(input)));
  const prefillPath = stringFlag(flags, "prefill");
  const prefill = prefillPath ? await readJson(path.resolve(prefillPath)) : null;
  const client = await readFile(path.join(EVAL_DIR, "src", "sheet-client.js"), "utf8");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Eligibility labels ${candidates.session}</title>
<style>${CSS}</style>
</head>
<body>
${BODY.replace("__SESSION__", String(candidates.session))}
<script type="application/json" id="sheet-data">${scriptJson({ ...candidates, prefill })}</script>
<script>${client.replace(/<\/script/gi, "<\\/script")}</script>
</body>
</html>
`;
  await writeFile(outPath, html);
  console.log(
    `wrote ${outPath}: ${candidates.candidates.length} posts, ${candidates.countries.join("/")} x ${candidates.ways.join("/")}, ${(html.length / 1024).toFixed(0)} KB`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
