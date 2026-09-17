// Browser code of the labeling sheet. `sheet.ts` inlines it into a self-contained HTML file that
// runs from file://: no network calls, no external scripts.
/* global document, window, FileReader */
"use strict";

(function main() {
  const DATA = JSON.parse(document.getElementById("sheet-data").textContent);
  const TIERS = ["green", "yellow", "white", "red"];
  const TIER_KEYS = {
    g: "green",
    y: "yellow",
    w: "white",
    r: "red",
    1: "green",
    2: "yellow",
    3: "white",
    4: "red",
  };
  const WAY_SHORT = { "b2b-contractor": "B2B", "eor-employee": "EOR" };
  const STORE_KEY = "pemby-eval-sheet:" + DATA.session + ":" + DATA.generatedAt;
  const posts = DATA.candidates;
  const pairKeys = [];
  for (const country of DATA.countries)
    for (const way of DATA.ways) pairKeys.push(country + "|" + way);

  // state[postId] = { skip, pairs: { "MD|b2b-contractor": { tier, proposed, note } } }
  let state = {};
  try {
    state = JSON.parse(localStorage.getItem(STORE_KEY) || "{}") || {};
  } catch {
    state = {};
  }
  function postState(id) {
    if (!state[id]) state[id] = { skip: false, pairs: {} };
    return state[id];
  }
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch {
      // Private window or blocked storage: the sheet still works, it just won't survive a reload.
    }
    updateProgress();
  }

  const esc = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  const KEYWORDS =
    /\b(authori[sz]\w*|work permit|right to work|eligib\w*|visa|sponsor\w*|citizen\w*|based in|located in|resid\w*|relocat\w*|contractors?|B2B|EOR|employer of record|Deel|EMEA|Europe(?:an)?|EU|EEA|LATAM|APAC|worldwide|anywhere|countr(?:y|ies)|time ?zones?|UTC|GMT|CET|EST|PST|overlap|remote|Moldova|Chi[sș]in[aă]u|Ukraine|Kyiv|Georgia|Tbilisi)\b/gi;
  const markKeywords = (html) => html.replace(KEYWORDS, "<b>$&</b>");

  /** Description with key spans wrapped in <mark>, escaped. */
  function descriptionHtml(text, spans) {
    const ranges = [];
    for (const span of spans) {
      const start = text.indexOf(span);
      if (start >= 0) ranges.push([start, start + span.length]);
    }
    ranges.sort((a, b) => a[0] - b[0]);
    let html = "";
    let at = 0;
    for (const [start, end] of ranges) {
      if (start < at) continue;
      html +=
        esc(text.slice(at, start)) +
        "<mark>" +
        markKeywords(esc(text.slice(start, end))) +
        "</mark>";
      at = end;
    }
    return html + esc(text.slice(at));
  }

  // ---- render ----
  const list = document.getElementById("cards");
  list.innerHTML = posts
    .map((post, i) => {
      const s = post.snapshot;
      const rows = DATA.countries
        .map(
          (country) =>
            "<tr><th>" +
            esc(country) +
            "</th>" +
            DATA.ways
              .map((way) => {
                const key = country + "|" + way;
                const name = "t-" + i + "-" + key.replace("|", "-");
                return (
                  '<td class="pair" data-key="' +
                  esc(key) +
                  '"><span class="way">' +
                  esc(WAY_SHORT[way] || way) +
                  '</span><span class="seg">' +
                  TIERS.map(
                    (tier) =>
                      '<label class="opt ' +
                      tier +
                      '"><input type="radio" name="' +
                      esc(name) +
                      '" value="' +
                      tier +
                      '"><span>' +
                      tier[0].toUpperCase() +
                      "</span></label>",
                  ).join("") +
                  '</span><span class="flag">proposed</span><input class="note" type="text" placeholder="note" aria-label="note ' +
                  esc(country + " " + way) +
                  '"></td>'
                );
              })
              .join("") +
            "</tr>",
        )
        .join("");
      return (
        '<section class="card" tabindex="-1" data-index="' +
        i +
        '" data-id="' +
        esc(post.id) +
        '">' +
        '<header><span class="num">' +
        (i + 1) +
        "/" +
        posts.length +
        "</span><h2>" +
        esc(s.title) +
        '</h2><span class="company">' +
        esc(s.company) +
        '</span><a href="' +
        esc(post.url) +
        '" target="_blank" rel="noreferrer">post ↗</a></header>' +
        '<div class="meta"><span>' +
        esc(s.locations.join(" · ") || "no location") +
        "</span><span>" +
        esc(s.workplaceType || "?") +
        "</span><span>" +
        esc(s.employmentType || "?") +
        '</span><span class="bucket">' +
        esc(post.category) +
        '</span><span class="why">' +
        esc(post.why) +
        "</span></div>" +
        (post.keySpans.length
          ? '<ul class="spans">' +
            post.keySpans.map((k) => "<li>" + markKeywords(esc(k)) + "</li>").join("") +
            "</ul>"
          : '<p class="nospans">No location, authorization or engagement sentences found. Check the description.</p>') +
        '<details><summary>Full description</summary><div class="desc">' +
        descriptionHtml(s.descriptionText, post.keySpans) +
        "</div></details>" +
        '<table class="pairs"><tbody>' +
        rows +
        "</tbody></table>" +
        '<label class="skip"><input type="checkbox"> Skip this post</label>' +
        "</section>"
      );
    })
    .join("");

  const cards = Array.from(list.querySelectorAll(".card"));

  function paintCard(card) {
    const post = posts[Number(card.dataset.index)];
    const ps = state[post.id] || { skip: false, pairs: {} };
    card.classList.toggle("skipped", !!ps.skip);
    card.querySelector(".skip input").checked = !!ps.skip;
    let done = 0;
    for (const td of card.querySelectorAll(".pair")) {
      const p = ps.pairs[td.dataset.key];
      for (const input of td.querySelectorAll("input[type=radio]"))
        input.checked = !!p && p.tier === input.value;
      td.classList.toggle("proposed", !!p && !!p.tier && p.proposed);
      td.classList.toggle("set", !!p && !!p.tier && !p.proposed);
      const note = td.querySelector(".note");
      if (document.activeElement !== note) note.value = (p && p.note) || "";
      if (p && p.tier && !p.proposed) done++;
    }
    card.classList.toggle("complete", !ps.skip && done === pairKeys.length);
  }

  function updateProgress() {
    let complete = 0;
    let skipped = 0;
    let proposed = 0;
    for (const post of posts) {
      const ps = state[post.id];
      if (!ps) continue;
      if (ps.skip) {
        skipped++;
        continue;
      }
      const values = pairKeys.map((k) => ps.pairs[k]);
      if (values.every((p) => p && p.tier && !p.proposed)) complete++;
      proposed += values.filter((p) => p && p.tier && p.proposed).length;
    }
    document.getElementById("progress").textContent =
      complete +
      "/" +
      posts.length +
      " labeled · " +
      skipped +
      " skipped · " +
      proposed +
      " proposed pairs to confirm";
  }

  // ---- cursor ----
  let cardIndex = 0;
  let pairIndex = 0;
  function focusCard(i, scroll) {
    cardIndex = Math.max(0, Math.min(cards.length - 1, i));
    for (const c of cards) c.classList.remove("current");
    const card = cards[cardIndex];
    card.classList.add("current");
    if (scroll) {
      card.scrollIntoView({ block: "start", behavior: "auto" });
      card.focus({ preventScroll: true });
    }
    paintCursor();
  }
  function paintCursor() {
    for (const td of document.querySelectorAll(".pair.cursor")) td.classList.remove("cursor");
    const td = cards[cardIndex].querySelectorAll(".pair")[pairIndex];
    if (td) td.classList.add("cursor");
  }

  function setTier(card, key, tier) {
    const ps = postState(card.dataset.id);
    const prev = ps.pairs[key] || {};
    ps.pairs[key] = { tier, proposed: false, note: prev.note || "" };
    paintCard(card);
    save();
  }

  // ---- events ----
  list.addEventListener("change", (event) => {
    const target = event.target;
    const card = target.closest(".card");
    if (!card) return;
    if (target.type === "radio") {
      const td = target.closest(".pair");
      const tds = Array.from(card.querySelectorAll(".pair"));
      cardIndex = Number(card.dataset.index);
      pairIndex = tds.indexOf(td);
      focusCard(cardIndex, false);
      setTier(card, td.dataset.key, target.value);
    } else if (target.closest(".skip")) {
      postState(card.dataset.id).skip = target.checked;
      paintCard(card);
      save();
    }
  });
  list.addEventListener("input", (event) => {
    const target = event.target;
    if (!target.classList.contains("note")) return;
    const card = target.closest(".card");
    const key = target.closest(".pair").dataset.key;
    const ps = postState(card.dataset.id);
    const p = ps.pairs[key] || { tier: null, proposed: false, note: "" };
    p.note = target.value;
    ps.pairs[key] = p;
    save();
  });
  // Clicking a proposed choice that is already selected confirms it (no change event fires).
  list.addEventListener("click", (event) => {
    const label = event.target.closest(".opt");
    if (!label) return;
    const card = label.closest(".card");
    const td = label.closest(".pair");
    const p = postState(card.dataset.id).pairs[td.dataset.key];
    const value = label.querySelector("input").value;
    if (p && p.proposed && p.tier === value) {
      event.preventDefault();
      setTier(card, td.dataset.key, value);
    }
  });

  document.addEventListener("keydown", (event) => {
    const el = document.activeElement;
    const typing =
      el && (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && el.type === "text"));
    if (typing) {
      if (event.key === "Escape" || event.key === "Enter") {
        el.blur();
        cards[cardIndex].focus({ preventScroll: true });
        event.preventDefault();
      }
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const card = cards[cardIndex];
    const tds = card.querySelectorAll(".pair");
    const key = event.key.toLowerCase();
    if (key === "j" || key === "k") {
      pairIndex = 0;
      focusCard(cardIndex + (key === "j" ? 1 : -1), true);
    } else if (key === "l" || event.key === "ArrowRight") {
      pairIndex = Math.min(tds.length - 1, pairIndex + 1);
      paintCursor();
    } else if (key === "h" || event.key === "ArrowLeft") {
      pairIndex = Math.max(0, pairIndex - 1);
      paintCursor();
    } else if (TIER_KEYS[key]) {
      setTier(card, tds[pairIndex].dataset.key, TIER_KEYS[key]);
      if (pairIndex < tds.length - 1) pairIndex++;
      else if (cardIndex < cards.length - 1) {
        pairIndex = 0;
        focusCard(cardIndex + 1, true);
        return event.preventDefault();
      }
      paintCursor();
    } else if (key === "a") {
      const ps = postState(card.dataset.id);
      for (const k of pairKeys) if (ps.pairs[k] && ps.pairs[k].tier) ps.pairs[k].proposed = false;
      paintCard(card);
      save();
    } else if (key === "s") {
      const ps = postState(card.dataset.id);
      ps.skip = !ps.skip;
      paintCard(card);
      save();
    } else if (key === "n") {
      tds[pairIndex].querySelector(".note").focus();
    } else if (key === "d") {
      const details = card.querySelector("details");
      details.open = !details.open;
    } else if (key === "?") {
      document.getElementById("help").toggleAttribute("open");
    } else return;
    event.preventDefault();
  });

  // ---- prefill ----
  function normalizePrefill(raw) {
    // Accepted: { id: { MD: { "b2b-contractor": "green" } } }, { id: [{country, wayOfWorking, tier, note}] },
    // or an export: [{ id, labels: [...] }].
    const out = {};
    const entries = Array.isArray(raw) ? raw.map((p) => [p.id, p.labels]) : Object.entries(raw);
    for (const [id, value] of entries) {
      const pairs = {};
      if (Array.isArray(value)) {
        for (const l of value)
          pairs[l.country + "|" + l.wayOfWorking] = { tier: l.tier, note: l.note || "" };
      } else if (value && typeof value === "object") {
        for (const [country, ways] of Object.entries(value)) {
          for (const [way, tier] of Object.entries(ways || {}))
            pairs[country + "|" + way] = { tier, note: "" };
        }
      }
      out[id] = pairs;
    }
    return out;
  }
  function applyPrefill(raw, confirmed) {
    const prefill = normalizePrefill(raw);
    let applied = 0;
    let unknown = 0;
    for (const [id, pairs] of Object.entries(prefill)) {
      const card = cards.find((c) => c.dataset.id === id);
      if (!card) {
        unknown++;
        continue;
      }
      const ps = postState(id);
      for (const [key, value] of Object.entries(pairs)) {
        if (!pairKeys.includes(key) || !TIERS.includes(value.tier)) continue;
        const existing = ps.pairs[key];
        if (existing && existing.tier && !existing.proposed) continue; // never override a confirmed choice
        ps.pairs[key] = {
          tier: value.tier,
          proposed: !confirmed,
          note: (existing && existing.note) || value.note,
        };
        applied++;
      }
      paintCard(card);
    }
    save();
    return (
      applied + " pairs prefilled" + (unknown ? ", " + unknown + " unknown post ids ignored" : "")
    );
  }
  const prefillStatus = document.getElementById("prefill-status");
  document.getElementById("prefill-file").addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        prefillStatus.textContent = applyPrefill(
          JSON.parse(reader.result),
          document.getElementById("prefill-confirmed").checked,
        );
      } catch (error) {
        prefillStatus.textContent = "Could not read prefill: " + error.message;
      }
    };
    reader.readAsText(file);
  });
  document.getElementById("prefill-apply").addEventListener("click", () => {
    const text = document.getElementById("prefill-text").value.trim();
    if (!text) return;
    try {
      prefillStatus.textContent = applyPrefill(
        JSON.parse(text),
        document.getElementById("prefill-confirmed").checked,
      );
    } catch (error) {
      prefillStatus.textContent = "Could not read prefill: " + error.message;
    }
  });

  // ---- export ----
  function buildExport() {
    const labeledAt = new Date().toISOString();
    const out = [];
    const incomplete = [];
    let skipped = 0;
    posts.forEach((post, i) => {
      const ps = state[post.id];
      if (ps && ps.skip) {
        skipped++;
        return;
      }
      const values = pairKeys.map((k) => (ps ? ps.pairs[k] : undefined));
      if (!values.every((p) => p && p.tier && !p.proposed)) {
        incomplete.push(i + 1);
        return;
      }
      out.push({
        id: post.id,
        jobId: post.jobId,
        url: post.url,
        source: post.source,
        snapshot: post.snapshot,
        category: post.category,
        labels: pairKeys.map((k, j) => {
          const [country, wayOfWorking] = k.split("|");
          const label = { country, wayOfWorking, tier: values[j].tier };
          if (values[j].note && values[j].note.trim()) label.note = values[j].note.trim();
          return label;
        }),
        labeledBy: "owner+lead",
        labeledAt,
        session: DATA.session,
      });
    });
    return { out, incomplete, skipped };
  }
  const dialog = document.getElementById("export");
  document.getElementById("export-open").addEventListener("click", () => {
    const { out, incomplete, skipped } = buildExport();
    document.getElementById("export-summary").textContent =
      out.length +
      " posts exported, " +
      skipped +
      " skipped" +
      (incomplete.length
        ? ", not exported (unlabeled or unconfirmed): #" + incomplete.join(", #")
        : "");
    document.getElementById("export-text").value = JSON.stringify(out, null, 2);
    dialog.showModal();
  });
  document.getElementById("export-download").addEventListener("click", () => {
    const blob = new Blob([document.getElementById("export-text").value], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "labels-session-" + DATA.session + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  document.getElementById("export-copy").addEventListener("click", async () => {
    const area = document.getElementById("export-text");
    const status = document.getElementById("export-copy");
    try {
      await navigator.clipboard.writeText(area.value);
      status.textContent = "Copied";
    } catch {
      area.select();
      status.textContent = document.execCommand("copy") ? "Copied" : "Select all and copy";
    }
  });
  document.getElementById("export-close").addEventListener("click", () => dialog.close());
  document.getElementById("reset").addEventListener("click", () => {
    if (!window.confirm("Clear every choice on this sheet?")) return;
    state = {};
    cards.forEach(paintCard);
    save();
  });

  // Embedded prefill (sheet.ts --prefill) applies once, before any saved choices exist.
  if (DATA.prefill && Object.keys(state).length === 0) applyPrefill(DATA.prefill, false);
  cards.forEach(paintCard);
  updateProgress();
  focusCard(0, false);
  document.body.dataset.ready = String(cards.length);
})();
