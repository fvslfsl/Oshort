/* OShort options page — compact "pro tool" editor.
 * Presets are collapsible cards laid out in group columns (max 4 across).
 * Shortcut = Alt + position (1st preset -> Alt+1, ...) unless a custom one is set. */
"use strict";
const STORAGE_KEY = "oshort_presets";

let presets = [];
let dragIndex = null;           // index of the preset being dragged
let filter = "";                // top-bar search text
const expanded = new Set();     // preset objects whose card is open
const textMode = new Set();     // preset objects edited as plain text

const listEl = document.getElementById("list");
const savedEl = document.getElementById("saved");
const searchEl = document.getElementById("search");

// ---------- icons ----------
const SVG = (d, size, fill) =>
  `<svg viewBox="0 0 16 16" width="${size}" height="${size}" fill="${fill ? "currentColor" : "none"}" ` +
  `stroke="${fill ? "none" : "currentColor"}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICON = {
  grip: SVG('<circle cx="6" cy="4" r="1.1"/><circle cx="10" cy="4" r="1.1"/><circle cx="6" cy="8" r="1.1"/><circle cx="10" cy="8" r="1.1"/><circle cx="6" cy="12" r="1.1"/><circle cx="10" cy="12" r="1.1"/>', 14, true),
  chev: SVG('<path d="M6 4l4 4-4 4"/>', 14),
  plus: SVG('<path d="M8 3.5v9M3.5 8h9"/>', 14),
  x: SVG('<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/>', 13),
  trash: SVG('<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"/>', 14),
  download: SVG('<path d="M8 2.5v8M4.8 7.3L8 10.5l3.2-3.2M3 13.5h10"/>', 14),
  copy: SVG('<rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5v-1A1.5 1.5 0 0 0 9 3H4a1.5 1.5 0 0 0-1.5 1.5v5A1.5 1.5 0 0 0 4 11h1.5"/>', 14),
  code: SVG('<path d="M5.5 4.5L2 8l3.5 3.5M10.5 4.5L14 8l-3.5 3.5"/>', 14),
  list: SVG('<path d="M6 4.5h7.5M6 8h7.5M6 11.5h7.5M2.5 4.5h.01M2.5 8h.01M2.5 11.5h.01"/>', 14),
  sun: SVG('<circle cx="8" cy="8" r="2.8"/><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"/>', 15),
  moon: SVG('<path d="M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8z"/>', 15),
  search: SVG('<circle cx="7" cy="7" r="4.3"/><path d="M10.3 10.3L13.5 13.5"/>', 14),
  clock: SVG('<circle cx="8" cy="8" r="5.5"/><path d="M8 5.2V8l1.8 1.2"/>', 12),
  reset: SVG('<path d="M3 8a5 5 0 1 0 1.5-3.6M3 2.5V5h2.5"/>', 13),
  check: SVG('<path d="M3.5 8.5l3 3 6-7"/>', 12),
};

// ---------- tiny DOM helpers ----------
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function btnEl(cls, html, title, on) {
  const b = el("button", cls);
  b.type = "button"; b.innerHTML = html;
  if (title) b.title = title;
  b.addEventListener("click", on);
  return b;
}
function field(label, control) {
  const f = el("div", "field");
  f.append(el("span", null, label), control);
  return f;
}
function kbdHTML(label) {
  return String(label).split("+").map((k) => `<kbd>${esc(k)}</kbd>`).join("");
}

// ---------- theme (dark by default; shared with the floating panel) ----------
const THEME_KEY = "oshort_theme";
let theme = "dark";
const themeToggle = document.getElementById("themeToggle");
function applyTheme() {
  document.documentElement.setAttribute("data-theme", theme);
  if (themeToggle) {
    themeToggle.innerHTML = theme === "dark" ? ICON.sun : ICON.moon;
    themeToggle.title = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
  }
}
function setTheme(t, persist) {
  theme = t === "light" ? "light" : "dark";
  applyTheme();
  if (persist) { try { chrome.storage.local.set({ [THEME_KEY]: theme }); } catch (_) {} }
}
function loadTheme() {
  return new Promise((res) => {
    try { chrome.storage.local.get(THEME_KEY, (o) => { const t = o && o[THEME_KEY]; theme = t === "light" ? "light" : "dark"; res(); }); }
    catch (_) { res(); }
  });
}
if (themeToggle) themeToggle.addEventListener("click", () => setTheme(theme === "dark" ? "light" : "dark", true));

// ---------- FLIP reorder animation ----------
// Measure element positions (First), run the DOM mutation (Last), then invert each
// element to its old spot and transition to 0 so it slides into place — instead of
// snapping. keyOf maps an element to a stable identity that survives the re-render.
function flipMove(getEls, keyOf, mutate) {
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) { mutate(); return; }
  const first = new Map();
  getEls().forEach((e) => { const k = keyOf(e); if (k != null) first.set(k, e.getBoundingClientRect()); });
  mutate();
  getEls().forEach((e) => {
    const k = keyOf(e); if (k == null) return;
    const f = first.get(k); if (!f) return;
    const l = e.getBoundingClientRect();
    const dx = f.left - l.left, dy = f.top - l.top;
    if (!dx && !dy) return;
    e.style.transition = "none";
    e.style.transform = "translate(" + dx + "px," + dy + "px)";
    void e.offsetWidth; // force reflow so the invert sticks before we animate
    requestAnimationFrame(() => {
      e.style.transition = "transform .22s cubic-bezier(.2,.7,.3,1)";
      e.style.transform = "";
    });
    const clear = () => { e.style.transition = ""; e.style.transform = ""; e.removeEventListener("transitionend", clear); };
    e.addEventListener("transitionend", clear);
  });
}
const flipCards = (mutate) => flipMove(() => [...listEl.querySelectorAll(".pcard")], (e) => e._preset, mutate);

function load() {
  return new Promise((res) => {
    chrome.storage.local.get(STORAGE_KEY, (o) => {
      const v = o && o[STORAGE_KEY];
      presets = Array.isArray(v) ? v : [];
      res();
    });
  });
}

// A step is a string (click), {type:"click",text,delayMs?} or
// {type:"input",label,value,delayMs?}. In the editor:
//   Bookings                         -> click
//   @Report Name = pm ac             -> type into a field
//   Download As... (delay 1s)        -> click, then wait 1s before the next step
function fmtDelay(ms) { return ms % 1000 === 0 ? (ms / 1000) + "s" : ms + "ms"; }
function splitDelay(line) {
  const m = /^(.*?)\s*\(\s*delay\s+(\d+)\s*(ms|s)?\s*\)\s*$/i.exec(line);
  if (!m) return [line, 0];
  let n = parseInt(m[2], 10);
  if ((m[3] || "s").toLowerCase() === "s") n *= 1000;
  return [m[1].trim(), n];
}
function baseText(s) {
  if (s && typeof s === "object") {
    if (s.type === "input") return `@${s.label} = ${s.value}`;
    if (s.type === "clear") return `clear: ${s.label}`;
    if (s.type === "key") return `key: ${s.label}`;
    return s.text;
  }
  return s;
}
function stepsToText(steps) {
  return (steps || []).map((s) => {
    const d = (s && typeof s === "object" && s.delayMs) || 0;
    return d ? `${baseText(s)} (delay ${fmtDelay(d)})` : baseText(s);
  }).join("\n");
}
function textToSteps(text) {
  return text.split("\n").map((line) => {
    const t = line.trim();
    if (!t) return null;
    const [rest, delayMs] = splitDelay(t);
    const k = /^key:\s*(.+)$/i.exec(rest);
    if (k) {
      const step = { type: "key", label: k[1].trim() };
      if (delayMs) step.delayMs = delayMs;
      return step;
    }
    const c = /^clear:\s*(.+)$/i.exec(rest);
    if (c) {
      const step = { type: "clear", label: c[1].trim() };
      if (delayMs) step.delayMs = delayMs;
      return step;
    }
    const m = /^@\s*(.+?)\s*=\s*(.*)$/.exec(rest);
    if (m) {
      const step = { type: "input", label: m[1].trim(), value: m[2] };
      if (delayMs) step.delayMs = delayMs;
      return step;
    }
    if (delayMs) return { type: "click", text: rest, delayMs };
    return rest; // plain click string (backward compatible)
  }).filter((s) => s !== null);
}

// ---------- share: one preset per .txt file ----------
// File format (Notepad-editable):
//   # <Preset name>
//   <step lines, using the same syntax as the editor>
// Lines starting with # are comments; the first one is the preset name.
const GROUP_RE = /^#+\s*group\s*:\s*(.*)$/i;   // "# group: Front Desk" directive line
function presetToText(p) {
  const grp = p.group ? `# group: ${p.group}\n` : "";
  return `# ${p.name || "Preset"}\n${grp}${stepsToText(p.steps)}\n`;
}
// Parse a file that may hold MANY presets (each starts with a "# Name" line).
// A "# group: X" line sets the group of the current preset (not a new preset).
function parseBundle(text, fallbackName) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const groups = [];
  let cur = null;
  const hasHeader = lines.some((l) => l.trim().startsWith("#") && !GROUP_RE.test(l.trim()));
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("#")) {
      const gm = GROUP_RE.exec(t);
      if (gm) { if (cur) cur.group = gm[1].trim(); continue; }
      cur = { name: t.replace(/^#+\s*/, "").trim() || "Imported preset", lines: [] }; groups.push(cur); continue;
    }
    if (!cur) { cur = { name: fallbackName || "Imported preset", lines: [] }; groups.push(cur); }
    cur.lines.push(line);
  }
  const out = groups
    .map((g) => { const o = { name: g.name, steps: textToSteps(g.lines.join("\n")) }; if (g.group) o.group = g.group; return o; })
    .filter((p) => p.steps.length);
  if (out.length === 1 && !hasHeader && fallbackName) out[0].name = fallbackName;
  return out;
}
function bundleText(list) {
  return (list || []).map(presetToText).join("\n");
}
function safeFileName(name) {
  const base = (name || "preset").replace(/[^\w.\- ]+/g, "_").trim().replace(/\s+/g, "_");
  return (base || "preset") + ".txt";
}
function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function uniqueName(base) {
  const names = new Set(presets.map((p) => p.name));
  if (!names.has(base)) return base;
  let i = 2;
  while (names.has(`${base} (${i})`)) i++;
  return `${base} (${i})`;
}

// ---------- custom shortcut recorder ----------
function buildHotkey(e) {
  if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return null; // lone modifier
  if (!(e.ctrlKey || e.altKey || e.metaKey || e.shiftKey)) return null; // require a real modifier
  const parts = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (e.metaKey) parts.push("Meta");
  const key = e.code.replace(/^Key/, "").replace(/^Digit/, "").replace(/^Numpad/, "Num ") || e.key;
  parts.push(key.toUpperCase());
  return { ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey, code: e.code, label: parts.join("+") };
}
let recordingCleanup = null;
function recordHotkey(btn, preset) {
  if (recordingCleanup) recordingCleanup();
  btn.classList.add("recording");
  btn.textContent = "Press keys… (Esc cancels)";
  const onKey = (e) => {
    e.preventDefault(); e.stopPropagation();
    if (e.key === "Escape") { cleanup(); render(); return; }
    const hk = buildHotkey(e);
    if (!hk) return; // wait for a real combo
    presets.forEach((p) => { if (p !== preset && p.hotkey && p.hotkey.label === hk.label) delete p.hotkey; }); // no dupes
    preset.hotkey = hk;
    cleanup(); save(); render();
  };
  const cleanup = () => {
    document.removeEventListener("keydown", onKey, true);
    btn.classList.remove("recording");
    recordingCleanup = null;
  };
  recordingCleanup = cleanup;
  document.addEventListener("keydown", onKey, true);
}
function hotkeyLabel(p, idx) {
  if (p.hotkey && p.hotkey.label) return p.hotkey.label;
  return idx < 9 ? "Alt+" + (idx + 1) : "";
}
// Key-cap button that records a custom shortcut on click (+ optional reset).
function hotkeyControl(p, idx, withReset) {
  const wrap = el("span", "hk");
  const label = hotkeyLabel(p, idx);
  const b = el("button", "hkbtn " + (p.hotkey ? "custom" : "default"));
  b.type = "button";
  b.innerHTML = label ? kbdHTML(label) : '<span class="hk-none">Set shortcut</span>';
  b.title = p.hotkey ? "Custom shortcut — click to change"
    : "Click, then press a combo (Alt, Ctrl, Shift or ⌘ + key)" + (label ? ". Default is " + label + "." : "");
  b.addEventListener("click", (e) => { e.stopPropagation(); recordHotkey(b, p); });
  wrap.appendChild(b);
  if (withReset && p.hotkey) {
    wrap.appendChild(btnEl("iconbtn", ICON.reset, "Reset to default" + (idx < 9 ? " (Alt+" + (idx + 1) + ")" : ""),
      (e) => { e.stopPropagation(); delete p.hotkey; save(); render(); }));
  }
  return wrap;
}

// ---------- structured step editor ----------
// Normalize a stored step (string | click-obj | input-obj) to a full working obj.
function normStep(s) {
  if (s && typeof s === "object") {
    if (s.type === "input") return { type: "input", label: s.label || "", value: s.value || "", delayMs: s.delayMs || 0 };
    if (s.type === "clear") return { type: "clear", label: s.label || "", delayMs: s.delayMs || 0 };
    if (s.type === "key") return { type: "key", label: s.label || "", delayMs: s.delayMs || 0 };
    return { type: "click", text: s.text || "", delayMs: s.delayMs || 0 };
  }
  return { type: "click", text: s || "", delayMs: 0 };
}
// Build a key label ("Escape", "Ctrl+Enter", …) from a keydown event.
function keyName(e) {
  const c = e.code || "";
  if (/^Key[A-Z]$/.test(c)) return c.slice(3);
  if (/^Digit\d$/.test(c)) return c.slice(5);
  if (/^Numpad\d$/.test(c)) return "Num" + c.slice(6);
  if (/^Arrow/.test(c) || /^F\d{1,2}$/.test(c)) return c;
  const named = { Escape: "Escape", Enter: "Enter", Tab: "Tab", Space: "Space", Backspace: "Backspace",
    Delete: "Delete", Insert: "Insert", Home: "Home", End: "End", PageUp: "PageUp", PageDown: "PageDown" };
  return named[c] || e.key || c;
}
function labelFromKeyEvent(e) {
  const parts = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (e.metaKey) parts.push("Meta");
  parts.push(keyName(e));
  return parts.join("+");
}
// Working objects -> compact storage form (plain string for a delay-less click).
function denormSteps(arr) {
  return arr.map((s) => {
    if (s.type === "input") {
      const o = { type: "input", label: s.label, value: s.value };
      if (s.delayMs) o.delayMs = s.delayMs;
      return o;
    }
    if (s.type === "clear") {
      const o = { type: "clear", label: s.label };
      if (s.delayMs) o.delayMs = s.delayMs;
      return o;
    }
    if (s.type === "key") {
      const o = { type: "key", label: s.label };
      if (s.delayMs) o.delayMs = s.delayMs;
      return o;
    }
    if (s.delayMs) return { type: "click", text: s.text, delayMs: s.delayMs };
    return s.text;
  });
}
// One-line summary for a collapsed card. Typed values are masked (e.g. a PIN).
function stepShort(s) {
  const n = normStep(s);
  if (n.type === "input") return n.label + " = …";
  if (n.type === "clear") return "clear " + n.label;
  if (n.type === "key") return "⌨ " + n.label;
  return n.text;
}

// Build the editable step list for one preset. Writes back to p.steps and saves.
// Returns the wrapper; wrapper.addStep() appends a new blank step.
function buildStepEditor(p) {
  const wrap = el("div", "stepeditor");
  const list = el("div", "steplist");
  const work = (p.steps || []).map(normStep);
  const commit = () => { p.steps = denormSteps(work); save(); };
  let stepDrag = null;   // index of the step being dragged
  const flipRows = (mutate) => flipMove(() => [...list.children], (e) => e._workItem, mutate);
  const clearMarks = () => list.querySelectorAll(".drop-before,.drop-after,.dragging")
    .forEach((x) => x.classList.remove("drop-before", "drop-after", "dragging"));

  function focusRow(i) {
    const r = list.children[i];
    const f = r && r.querySelector(".stepinput, .stepkey");
    if (f) f.focus();
  }
  function inp(ph, val, i, on) {
    const e = el("input", "stepinput");
    e.placeholder = ph; e.value = val || ""; e.spellcheck = false;
    e.addEventListener("input", () => on(e.value));
    // Enter: jump to the next step, or add one after the last.
    e.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter") return;
      ev.preventDefault();
      if (i === work.length - 1) wrap.addStep(); else focusRow(i + 1);
    });
    return e;
  }
  function recordStepKey(button, st) {
    button.classList.add("recording");
    button.textContent = "Press a key…";
    const onKey = (e) => {
      e.preventDefault(); e.stopPropagation();
      if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return; // wait for a real key
      st.label = labelFromKeyEvent(e);
      document.removeEventListener("keydown", onKey, true);
      commit(); render2();
    };
    document.addEventListener("keydown", onKey, true);
  }
  function row(st, i) {
    const r = el("div", "steprow");
    r._workItem = st;           // stable identity for the FLIP animation
    r.dataset.type = st.type;   // colours the action label

    // drag handle — only the grip starts a drag, so the fields stay editable
    const grip = el("span", "grip");
    grip.innerHTML = ICON.grip; grip.title = "Drag to reorder"; grip.draggable = true;
    grip.addEventListener("dragstart", (e) => {
      stepDrag = i; e.dataTransfer.effectAllowed = "move";
      try { e.dataTransfer.setData("text/plain", ""); } catch (_) {}
      requestAnimationFrame(() => r.classList.add("dragging"));
    });
    grip.addEventListener("dragend", () => { stepDrag = null; clearMarks(); });
    // Drop above or below this row depending on which half the cursor is over.
    r.addEventListener("dragover", (e) => {
      if (stepDrag == null) return;
      e.preventDefault(); e.stopPropagation();
      const after = e.clientY > r.getBoundingClientRect().top + r.offsetHeight / 2;
      r.classList.toggle("drop-after", after);
      r.classList.toggle("drop-before", !after);
    });
    r.addEventListener("dragleave", (e) => { if (!r.contains(e.relatedTarget)) r.classList.remove("drop-before", "drop-after"); });
    r.addEventListener("drop", (e) => {
      if (stepDrag == null) return;
      e.preventDefault(); e.stopPropagation();
      const after = r.classList.contains("drop-after");
      const from = stepDrag;
      stepDrag = null; clearMarks();
      let dest = after ? i + 1 : i;
      if (from < dest) dest--;
      if (dest === from) return;
      flipRows(() => {
        const [moved] = work.splice(from, 1);
        work.splice(dest, 0, moved);
        render2();
      });
      commit();
    });

    const num = el("span", "stepnum", String(i + 1));

    const type = el("select", "steptype");
    type.title = "Action";
    type.innerHTML = '<option value="click">Click</option><option value="input">Type</option><option value="clear">Clear</option><option value="key">Key</option>';
    type.value = st.type;
    type.addEventListener("change", () => {
      st.type = type.value;
      if (st.type === "input") { st.label = st.label || st.text || ""; st.value = st.value || ""; }
      else if (st.type === "clear" || st.type === "key") { st.label = st.label || st.text || ""; }
      else { st.text = st.text || st.label || ""; }
      commit(); render2(); focusRow(i);
    });

    const fields = el("div", "stepfields");
    if (st.type === "click") {
      fields.appendChild(inp("Menu, button or option text", st.text, i, (v) => { st.text = v; commit(); }));
    } else if (st.type === "clear") {
      fields.appendChild(inp("Field label to clear", st.label, i, (v) => { st.label = v; commit(); }));
    } else if (st.type === "key") {
      const kb = el("button", "stepkey", st.label || "Click, then press a key…");
      kb.type = "button";
      kb.addEventListener("click", () => recordStepKey(kb, st));
      fields.appendChild(kb);
    } else {
      fields.append(
        inp("Field label", st.label, i, (v) => { st.label = v; commit(); }),
        el("span", "stepeq", "="),
        inp("Value", st.value, i, (v) => { st.value = v; commit(); })
      );
    }

    const delay = el("label", "delay" + (st.delayMs ? " set" : ""));
    delay.title = "Pause after this step (seconds)";
    const clock = el("span"); clock.innerHTML = ICON.clock;
    const dn = el("input");
    dn.type = "number"; dn.min = "0"; dn.step = "0.1"; dn.placeholder = "0";
    dn.value = st.delayMs ? st.delayMs / 1000 : "";
    dn.addEventListener("input", () => {
      const sec = parseFloat(dn.value);
      st.delayMs = isNaN(sec) || sec <= 0 ? 0 : Math.round(sec * 1000);
      delay.classList.toggle("set", !!st.delayMs);
      commit();
    });
    delay.append(clock, dn, el("small", null, "s"));

    const del = btnEl("iconbtn danger rowdel", ICON.x, "Delete step", () => {
      flipRows(() => { work.splice(i, 1); render2(); });
      commit();
    });

    const handle = el("span", "handle");   // shows the number; turns into the grip on hover
    handle.append(num, grip);
    r.append(handle, type, fields, delay, del);
    return r;
  }
  function render2() {
    list.innerHTML = "";
    work.forEach((st, i) => list.appendChild(row(st, i)));
  }
  wrap.addStep = () => {
    work.push({ type: "click", text: "", delayMs: 0 });
    commit(); render2(); focusRow(work.length - 1);
  };

  wrap.appendChild(list);
  render2();
  return wrap;
}

// Plain-text editing of a preset's steps (same syntax as the .txt files).
function buildTextEditor(p) {
  const w = el("div", "texteditor");
  const ta = el("textarea");
  ta.spellcheck = false;
  ta.value = stepsToText(p.steps);
  ta.rows = Math.min(16, Math.max(4, (p.steps || []).length + 1));
  let t;
  const commitText = () => { clearTimeout(t); p.steps = textToSteps(ta.value); save(); };
  ta.addEventListener("input", () => { clearTimeout(t); t = setTimeout(commitText, 400); });
  ta.addEventListener("change", commitText);   // flush before switching views
  const hint = el("div", "texthint");
  hint.innerHTML = 'One step per line: <code>Menu text</code> <code>@Field = value</code> <code>clear: Field</code> <code>key: Escape</code> <code>… (delay 1s)</code>';
  w.append(ta, hint);
  return w;
}

// ---------- groups ----------
// Each preset may carry an optional `group` (a string). We keep the stored array
// physically grouped — all presets of a group contiguous, groups in first-seen
// order — so the positional Alt+N shortcuts and the floating panel stay in the
// same order the options page shows.
function groupOf(p) { return (p && p.group) || ""; }
function regroup() {
  const order = [];
  const buckets = new Map();
  presets.forEach((p) => {
    const g = groupOf(p);
    if (!buckets.has(g)) { buckets.set(g, []); order.push(g); }
    buckets.get(g).push(p);
  });
  presets = order.reduce((acc, g) => acc.concat(buckets.get(g)), []);
}
// Assign a preset to a group (empty string = ungrouped). Moves it to the end of
// the array first so it lands at the end of its group's run, then regroups.
function assignGroup(p, group) {
  const g = (group || "").trim();
  if (g === groupOf(p)) return;
  flipCards(() => {
    if (g) p.group = g; else delete p.group;
    const i = presets.indexOf(p);
    if (i !== -1) { presets.splice(i, 1); presets.push(p); }
    regroup(); render();
  });
  save();
}
// Rename a whole group in one place (merges if the new name already exists).
function renameGroup(oldName, newName) {
  const nn = (newName || "").trim();
  if (nn === oldName) return;
  presets.forEach((p) => { if (groupOf(p) === oldName) { if (nn) p.group = nn; else delete p.group; } });
  regroup(); save(); render();
}
function refreshGroupDatalist() {
  const dl = document.getElementById("oshort-groups");
  if (!dl) return;
  const seen = [];
  presets.forEach((p) => { const g = groupOf(p); if (g && !seen.includes(g)) seen.push(g); });
  dl.innerHTML = seen.map((g) => `<option value="${esc(g)}"></option>`).join("");
}
// Move the preset at `from` so it lands at index `dest` (pre-removal index) in `group`.
function movePreset(from, dest, group) {
  const moved = presets[from];
  if (!moved) return;
  flipCards(() => {
    presets.splice(from, 1);
    if (from < dest) dest--;
    if (group) moved.group = group; else delete moved.group;
    presets.splice(dest, 0, moved);
    regroup(); render();
  });
  save();
}
function endOfGroup(g) {
  let last = -1;
  presets.forEach((x, k) => { if (groupOf(x) === g) last = k; });
  return last + 1;
}

let savedTimer;
let lastSelfSave = 0;   // marks our own writes so the storage listener ignores them
function save() {
  lastSelfSave = Date.now();
  chrome.storage.local.set({ [STORAGE_KEY]: presets }, () => {
    savedEl.classList.add("show");
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => savedEl.classList.remove("show"), 1200);
  });
}

// ---------- preset actions ----------
function focusCardName(p) {
  requestAnimationFrame(() => {
    const c = [...listEl.querySelectorAll(".pcard")].find((x) => x._preset === p);
    if (!c) return;
    c.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const i = c.querySelector(".f-name");
    if (i) { i.focus(); i.select(); }
  });
}
function newPreset(group) {
  const p = { name: uniqueName("New preset"), steps: [] };
  if (group) p.group = group;
  presets.push(p);
  regroup();
  expanded.add(p);
  if (filter) { filter = ""; searchEl.value = ""; }
  save(); render(); focusCardName(p);
}
function duplicatePreset(p) {
  const copy = JSON.parse(JSON.stringify(p));
  delete copy.hotkey;                         // shortcuts must stay unique
  copy.name = uniqueName((p.name || "Preset") + " copy");
  presets.splice(presets.indexOf(p) + 1, 0, copy);
  expanded.add(copy);
  save(); render(); focusCardName(copy);
}
function deletePreset(p) {
  if (!confirm(`Delete preset "${p.name}"?`)) return;
  flipCards(() => {
    const i = presets.indexOf(p);
    if (i !== -1) presets.splice(i, 1);
    expanded.delete(p); textMode.delete(p);
    render();
  });
  save();
}
function toggleCard(p) {
  if (expanded.has(p)) expanded.delete(p); else expanded.add(p);
  render();
}

// ---------- render ----------
function renderEmpty() {
  const box = el("div", "empty");
  box.innerHTML = "<h2>No presets yet</h2><p>Create one here, import a .txt file, or record one with the <b>OS</b> button inside OPERA.</p>";
  const row = el("div", "row");
  row.append(
    btnEl("btn primary", ICON.plus + "New preset", "", () => newPreset("")),
    btnEl("btn", "Import .txt", "", () => importFile.click())
  );
  box.appendChild(row);
  listEl.appendChild(box);
}

function render() {
  listEl.innerHTML = "";
  refreshGroupDatalist();
  if (!presets.length) { renderEmpty(); return; }

  const q = filter.trim().toLowerCase();
  const matches = (p) => !q || [p.name, groupOf(p), stepsToText(p.steps)].join("\n").toLowerCase().includes(q);
  const groupNames = [];
  presets.forEach((p) => { const g = groupOf(p); if (!groupNames.includes(g)) groupNames.push(g); });
  const hasGroups = groupNames.some((g) => g !== "");
  const visible = groupNames.filter((g) => presets.some((p) => groupOf(p) === g && matches(p)));
  if (!visible.length) { listEl.appendChild(el("div", "noresults", `No presets match “${filter}”.`)); return; }

  // One column per group, side by side (max 4 across; extra groups wrap).
  const grid = el("div", "groupgrid");
  grid.style.gridTemplateColumns = "repeat(" + Math.min(visible.length, 4) + ", minmax(0, 1fr))";
  listEl.appendChild(grid);
  const cols = new Map();
  visible.forEach((g) => { const c = buildColumn(g, hasGroups); cols.set(g, c); grid.appendChild(c.col); });

  presets.forEach((p, idx) => {
    if (!matches(p)) return;
    cols.get(groupOf(p)).cards.appendChild(buildCard(p, idx));
  });
}

function buildColumn(g, hasGroups) {
  const col = el("section", "groupcol");
  const head = el("div", "colhead");
  const name = el("input", "colname");
  name.value = g;
  name.placeholder = hasGroups ? "Ungrouped" : "Presets";
  if (g === "") name.disabled = true;
  else {
    name.title = "Rename group (applies to every preset in it)";
    name.addEventListener("change", () => renameGroup(g, name.value));
    name.addEventListener("keydown", (e) => { if (e.key === "Enter") name.blur(); if (e.key === "Escape") { name.value = g; name.blur(); } });
  }
  const count = el("span", "colcount", String(presets.filter((p) => groupOf(p) === g).length));
  const add = btnEl("iconbtn", ICON.plus, g ? `New preset in ${g}` : "New preset", () => newPreset(g));
  head.append(name, count, add);

  const cards = el("div", "cards");
  // Dropping on the heading or on empty space in the column moves the preset
  // to the end of this group.
  const dropToEnd = (zone) => {
    zone.addEventListener("dragover", (e) => {
      if (dragIndex == null) return;
      if (zone === cards && e.target !== cards) { cards.classList.remove("dragover"); return; }
      e.preventDefault(); zone.classList.add("dragover");
    });
    zone.addEventListener("dragleave", (e) => { if (!zone.contains(e.relatedTarget)) zone.classList.remove("dragover"); });
    zone.addEventListener("drop", (e) => {
      if (dragIndex == null) return;
      e.preventDefault(); zone.classList.remove("dragover");
      const from = dragIndex; dragIndex = null;
      movePreset(from, endOfGroup(g), g);
    });
  };
  dropToEnd(head); dropToEnd(cards);

  col.append(head, cards);
  return { col, cards };
}

function buildCard(p, idx) {
  const open = expanded.has(p);
  const card = el("article", "pcard" + (open ? " open" : ""));
  card._preset = p;   // stable identity for the FLIP animation

  const head = el("div", "pc-head");
  const grip = el("span", "grip");
  grip.innerHTML = ICON.grip; grip.title = "Drag to reorder or move to another group"; grip.draggable = true;
  const chev = el("span", "chev"); chev.innerHTML = ICON.chev;
  const title = el("div", "pc-title");
  const nameEl = el("span", "pc-name", p.name || "Untitled");
  const n = (p.steps || []).length;
  const sum = el("span", "pc-sum", n ? `${n} step${n === 1 ? "" : "s"} · ${(p.steps || []).map(stepShort).join(" → ")}` : "No steps yet");
  sum.title = sum.textContent;
  title.append(nameEl, sum);
  head.append(grip, chev, title, hotkeyControl(p, idx, false));
  head.addEventListener("click", (e) => { if (e.target.closest(".hk, .grip")) return; toggleCard(p); });
  card.appendChild(head);
  if (open) card.appendChild(buildBody(p, idx, nameEl));

  // drag & drop: drop above/below this card, joining its group
  grip.addEventListener("dragstart", (e) => {
    dragIndex = idx; e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", ""); } catch (_) {}
    requestAnimationFrame(() => card.classList.add("dragging"));
  });
  grip.addEventListener("dragend", () => {
    dragIndex = null;
    card.classList.remove("dragging");
    listEl.querySelectorAll(".drop-before,.drop-after,.dragover").forEach((x) => x.classList.remove("drop-before", "drop-after", "dragover"));
  });
  card.addEventListener("dragover", (e) => {
    if (dragIndex == null) return;
    e.preventDefault();
    const r = card.getBoundingClientRect();
    const after = e.clientY > r.top + r.height / 2;
    card.classList.toggle("drop-after", after);
    card.classList.toggle("drop-before", !after);
  });
  card.addEventListener("dragleave", (e) => { if (!card.contains(e.relatedTarget)) card.classList.remove("drop-before", "drop-after"); });
  card.addEventListener("drop", (e) => {
    if (dragIndex == null) return;
    e.preventDefault(); e.stopPropagation();
    const after = card.classList.contains("drop-after");
    card.classList.remove("drop-before", "drop-after");
    const from = dragIndex; dragIndex = null;
    if (from === idx) return;
    movePreset(from, after ? idx + 1 : idx, groupOf(p));
  });
  return card;
}

function buildBody(p, idx, nameEl) {
  const body = el("div", "pc-body");

  const nameIn = el("input", "input f-name");
  nameIn.value = p.name || ""; nameIn.placeholder = "Preset name";
  nameIn.addEventListener("input", () => { nameEl.textContent = nameIn.value.trim() || "Untitled"; });
  nameIn.addEventListener("change", () => { p.name = nameIn.value.trim() || "Untitled"; save(); });
  nameIn.addEventListener("keydown", (e) => { if (e.key === "Enter") nameIn.blur(); });

  const grpIn = el("input", "input");
  grpIn.value = groupOf(p); grpIn.placeholder = "No group";
  grpIn.setAttribute("list", "oshort-groups");
  grpIn.addEventListener("change", () => assignGroup(p, grpIn.value));
  grpIn.addEventListener("keydown", (e) => { if (e.key === "Enter") grpIn.blur(); });

  const meta = el("div", "pc-meta");
  meta.append(field("Name", nameIn), field("Group", grpIn), field("Shortcut", hotkeyControl(p, idx, true)));
  body.appendChild(meta);

  const isText = textMode.has(p);
  const editor = isText ? buildTextEditor(p) : buildStepEditor(p);
  body.appendChild(editor);

  const foot = el("div", "pc-foot");
  if (!isText) foot.appendChild(btnEl("btn ghost", ICON.plus + "Add step", "Add a step (or press Enter in the last step)", () => editor.addStep()));
  foot.appendChild(btnEl("btn ghost", isText ? ICON.list + "Step editor" : ICON.code + "Edit as text",
    isText ? "Back to the step editor" : "Edit the steps as plain text",
    () => { if (isText) textMode.delete(p); else textMode.add(p); render(); }));
  foot.appendChild(el("span", "spacer"));
  foot.appendChild(btnEl("iconbtn", ICON.copy, "Duplicate preset", () => duplicatePreset(p)));
  foot.appendChild(btnEl("iconbtn", ICON.download, "Export as .txt", () => downloadText(safeFileName(p.name), presetToText(p))));
  foot.appendChild(btnEl("iconbtn danger", ICON.trash, "Delete preset", () => deletePreset(p)));
  body.appendChild(foot);
  return body;
}

// ---------- top bar ----------
document.getElementById("searchIcon").innerHTML = ICON.search;
document.getElementById("helpIcon").innerHTML = ICON.chev;
savedEl.innerHTML = ICON.check + "Saved";

searchEl.addEventListener("input", () => { filter = searchEl.value; render(); });
searchEl.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { searchEl.value = ""; filter = ""; render(); searchEl.blur(); }
});
// "/" focuses the filter (unless you're typing somewhere).
document.addEventListener("keydown", (e) => {
  if (e.key !== "/" || e.ctrlKey || e.altKey || e.metaKey || recordingCleanup) return;
  const t = e.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
  e.preventDefault(); searchEl.focus(); searchEl.select();
});

document.getElementById("newBtn").addEventListener("click", () => newPreset(""));

// ---------- import (.txt, one or many presets per file) ----------
const importBtn = document.getElementById("importBtn");
const importFile = document.getElementById("importFile");
importBtn.addEventListener("click", () => importFile.click());
importFile.addEventListener("change", async () => {
  const files = [...importFile.files];
  importFile.value = ""; // allow re-importing the same file later
  let added = 0;
  for (const f of files) {
    let text;
    try { text = await f.text(); } catch (_) { continue; }
    const fallback = f.name.replace(/\.txt$/i, "");
    for (const p of parseBundle(text, fallback)) {   // a file may hold one or many
      const np = { name: uniqueName(p.name), steps: p.steps };
      if (p.group) np.group = p.group;
      presets.push(np);
      added++;
    }
  }
  if (added) { regroup(); save(); render(); }
  else alert("No presets found in the selected file(s).");
});

// Export ALL presets into one shareable/backup .txt bundle.
document.getElementById("exportAllBtn").addEventListener("click", () => {
  if (!presets.length) { alert("No presets to export yet."); return; }
  downloadText("oshort-presets.txt", bundleText(presets));
});

// keep in sync if changed elsewhere (e.g. recorder on the page)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes[THEME_KEY]) setTheme(changes[THEME_KEY].newValue, false); // e.g. toggled from the panel
  if (changes[STORAGE_KEY]) {
    // Ignore our own writes — re-rendering on every keystroke's save would blow away
    // the input you're typing in (the "deselects after one character" bug).
    if (Date.now() - lastSelfSave < 1500) return;
    // New objects arrive from storage: carry the open/text-mode state over by name.
    const openNames = new Set([...expanded].map((p) => p.name));
    const textNames = new Set([...textMode].map((p) => p.name));
    presets = changes[STORAGE_KEY].newValue || [];
    regroup();
    expanded.clear(); textMode.clear();
    presets.forEach((p) => { if (openNames.has(p.name)) expanded.add(p); if (textNames.has(p.name)) textMode.add(p); });
    if (!recordingCleanup) render(); // don't interrupt an in-progress shortcut recording
  }
});

loadTheme().then(applyTheme);
applyTheme();
load().then(() => { regroup(); render(); });
