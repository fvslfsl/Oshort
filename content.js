/* OPERA Shortcut (OShort)
 * Floating button that replays a preset series of menu clicks in OPERA Cloud.
 *
 * OPERA Cloud is an Oracle ADF app: menu items have no stable ids and use
 * obfuscated class names, so steps are matched by VISIBLE TEXT. Menus render
 * asynchronously (flyouts open on hover), so replay waits for each item to
 * appear, then fires a full pointer+mouse event sequence (a plain .click()
 * is ignored by ADF's event delegation).
 */
(() => {
  "use strict";
  if (window.__oshortLoaded) return;
  window.__oshortLoaded = true;

  const STORAGE_KEY = "oshort_presets";
  const THEME_KEY = "oshort_theme";   // "dark" (default) | "light"
  let theme = "dark";
  const DEFAULT_PRESETS = [
    { name: "Manage Reservation", steps: ["Bookings", "Reservations", "Manage Reservation"] }
  ];
  // Shortcut = Alt + the preset's position: 1st preset -> Alt+1, ... 9th -> Alt+9.

  // ---------- storage ----------
  const store = {
    get() {
      return new Promise((res) => {
        chrome.storage.local.get(STORAGE_KEY, (o) => {
          const v = o && o[STORAGE_KEY];
          res(Array.isArray(v) ? v : null);
        });
      });
    },
    set(presets) {
      return new Promise((res) => chrome.storage.local.set({ [STORAGE_KEY]: presets }, res));
    }
  };

  // ---------- theme (dark by default; toggled from the panel or options page) ----------
  function getTheme() {
    return new Promise((res) => {
      try { chrome.storage.local.get(THEME_KEY, (o) => { const t = o && o[THEME_KEY]; res(t === "light" ? "light" : "dark"); }); }
      catch (_) { res("dark"); }
    });
  }
  function applyTheme() {
    if (!root) return;
    root.dataset.theme = theme;
    const btn = panel && panel.querySelector(".os-theme");
    if (btn) {
      const dark = theme === "dark";
      btn.innerHTML = dark ? ICON.sun : ICON.moon;   // show the mode you'd switch TO
      btn.title = dark ? "Switch to light mode" : "Switch to dark mode";
    }
  }

  // ---------- icons (inline SVG, 16px grid) ----------
  const SVG = (d, size, fill) =>
    `<svg viewBox="0 0 16 16" width="${size}" height="${size}" fill="${fill ? "currentColor" : "none"}" ` +
    `stroke="${fill ? "none" : "currentColor"}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const ICON = {
    search: SVG('<circle cx="7" cy="7" r="4.3"/><path d="M10.3 10.3L13.5 13.5"/>', 14),
    sun: SVG('<circle cx="8" cy="8" r="2.8"/><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"/>', 14),
    moon: SVG('<path d="M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8z"/>', 14),
    gear: SVG('<path d="M2.5 5h11M2.5 11h11"/><circle cx="5.5" cy="5" r="1.7" style="fill:var(--os-surface)"/><circle cx="10.5" cy="11" r="1.7" style="fill:var(--os-surface)"/>', 14),
    x: SVG('<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/>', 12),
    upload: SVG('<path d="M8 13.5v-8M4.8 8.7L8 5.5l3.2 3.2M3 2.5h10"/>', 13),
    dot: SVG('<circle cx="8" cy="8" r="4"/>', 10, true),
    check: SVG('<path d="M3.5 8.5l3 3 6-7"/>', 14),
    alert: SVG('<path d="M8 2.5l6 11H2z"/><path d="M8 6.5v3M8 11.6h.01"/>', 14),
  };
  function setTheme(t) {
    theme = t === "light" ? "light" : "dark";
    applyTheme();
    try { chrome.storage.local.set({ [THEME_KEY]: theme }); } catch (_) {}
  }

  // ---------- matching / clicking ----------
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();

  function isVisible(el) {
    if (!el || !el.getClientRects().length) return false;
    const st = getComputedStyle(el);
    return st.visibility !== "hidden" && st.display !== "none";
  }

  // Find the best element matching an exact visible-text label.
  function findByText(text) {
    const want = norm(text);
    if (!want) return null;
    const sel = 'tr[role="menuitem"],div[role="menuitem"],a,button,td,span,li,div';
    const matches = [];
    for (const el of document.querySelectorAll(sel)) {
      if (el.closest("#oshort-root")) continue;      // ignore our own UI
      if (norm(el.textContent) !== want) continue;   // exact label only
      if (!isVisible(el)) continue;
      matches.push(el);
    }
    if (!matches.length) return null;
    // Prefer real menu items, then the most specific (fewest descendants).
    matches.sort((a, b) => {
      const am = a.getAttribute("role") === "menuitem" ? 0 : 1;
      const bm = b.getAttribute("role") === "menuitem" ? 0 : 1;
      if (am !== bm) return am - bm;
      return a.querySelectorAll("*").length - b.querySelectorAll("*").length;
    });
    return matches[0];
  }

  function waitForText(text, timeout = 10000, runId) {
    return new Promise((resolve) => {
      const found = findByText(text);
      if (found) return resolve(found);
      const start = Date.now();
      const iv = setInterval(() => {
        if (runId != null && runId !== currentRun) { clearInterval(iv); resolve(null); return; }
        const el = findByText(text);
        if (el) { clearInterval(iv); resolve(el); }
        else if (Date.now() - start > timeout) { clearInterval(iv); resolve(null); }
      }, 100);
    });
  }

  // ADF renders radios/checkboxes as a hidden <input> behind a styled label,
  // so clicking the visible label text does nothing. If the clicked element is
  // an option label, find its underlying radio/checkbox and drive that instead.
  function findAssociatedToggle(el) {
    const want = norm(el.textContent);
    let node = el;
    for (let i = 0; i < 4 && node; i++) {
      if (node.tagName === "LABEL" && node.getAttribute("for")) {
        const t = document.getElementById(node.getAttribute("for"));
        if (t && (t.type === "radio" || t.type === "checkbox")) return t;
      }
      node = node.parentElement;
    }
    // Nearest small container that holds exactly one radio/checkbox and whose
    // text is just this option (so we don't grab an unrelated control).
    node = el;
    for (let i = 0; i < 4 && node; i++) {
      if (node.querySelectorAll) {
        const inputs = node.querySelectorAll('input[type="radio"],input[type="checkbox"]');
        if (inputs.length === 1 && want && norm(node.textContent) === want) return inputs[0];
      }
      node = node.parentElement;
    }
    return null;
  }

  function selectToggle(input) {
    try { input.focus({ preventScroll: true }); } catch (_) {}
    if (input.type === "radio") {
      input.checked = true;
      input.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    } else {
      input.click(); // native toggle for a checkbox
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // Fire a realistic event sequence so ADF's delegated handlers respond.
  function fireClick(el) {
    const toggle = findAssociatedToggle(el);
    if (toggle) { selectToggle(toggle); return; }
    el.scrollIntoView({ block: "center", inline: "center" });
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const base = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0 };
    const seq = ["pointerover", "pointerenter", "pointermove", "mouseover", "mouseenter",
                 "mousemove", "pointerdown", "mousedown", "pointerup", "mouseup", "click"];
    try { el.focus({ preventScroll: true }); } catch (_) {}
    for (const type of seq) {
      let ev;
      try { ev = type.startsWith("pointer") ? new PointerEvent(type, base) : new MouseEvent(type, base); }
      catch (_) { ev = new MouseEvent(type, base); }
      el.dispatchEvent(ev);
    }
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- run control (double-Esc to abort a running preset) ----------
  // Every runPreset() call takes the next token. The loop and all its waits
  // bail the moment currentRun no longer equals their token, so aborting is
  // instant even mid-wait.
  let currentRun = 0;
  let runActive = false;
  // A sleep that also ends early if this run was aborted.
  function waitMs(ms, runId) {
    return new Promise((resolve) => {
      const start = Date.now();
      const iv = setInterval(() => {
        if ((runId != null && runId !== currentRun) || Date.now() - start >= ms) {
          clearInterval(iv); resolve();
        }
      }, 50);
    });
  }
  function abortRun() {
    if (!runActive) return;
    currentRun++;      // invalidate the in-flight run -> its loop/waits bail
    runActive = false;
    if (root) root.classList.remove("oshort-running");
    toast("Stopped", "err");
  }

  // ---------- wait for OPERA to finish loading ----------
  // bridge.js (MAIN world) publishes ADF's busy state here. Absent attribute
  // (bridge not loaded / non-ADF page) is treated as ready so we never hang.
  function isReady() {
    const v = document.documentElement.getAttribute("data-oshort-ready");
    return v === null ? true : v === "1";
  }
  function waitForReady(timeout = 15000, runId) {
    return new Promise((resolve) => {
      const start = Date.now();
      const iv = setInterval(() => {
        if ((runId != null && runId !== currentRun) || isReady() || Date.now() - start > timeout) {
          clearInterval(iv); resolve();
        }
      }, 100);
    });
  }

  // ---------- form fields (record & replay typed input) ----------
  // A step is one of:
  //   "Bookings"                              -> click that visible text
  //   { type:"click", text, delayMs? }        -> click, with an optional extra wait after
  //   { type:"input", label, value, delayMs? }-> type value into the field with that label
  //   { type:"clear", label, delayMs? }       -> delete the text in the field with that label
  //   { type:"key", label, delayMs? }         -> press a key (e.g. "Escape", "Enter", "Ctrl+Enter")
  // delayMs is an extra pause AFTER the step (on top of the normal ready-wait).
  function isInputStep(step) { return step && typeof step === "object" && step.type === "input"; }
  function isClearStep(step) { return step && typeof step === "object" && step.type === "clear"; }
  function isKeyStep(step) { return step && typeof step === "object" && step.type === "key"; }
  function stepText(step) {
    if (step && typeof step === "object") {
      if (step.type === "key") return step.label;
      return (step.type === "input" || step.type === "clear") ? step.label : step.text;
    }
    return step;
  }
  function stepDelay(step) { return (step && typeof step === "object" && step.delayMs) || 0; }

  // ---------- key press (record & replay) ----------
  // A key step stores a human label like "Escape", "Enter", "Ctrl+Enter", "ArrowDown".
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
  function nameToKeyCode(name) {
    const t = (name || "").trim();
    if (/^[A-Za-z]$/.test(t)) return { key: t.toLowerCase(), code: "Key" + t.toUpperCase() };
    if (/^\d$/.test(t)) return { key: t, code: "Digit" + t };
    if (/^Num\d$/.test(t)) return { key: t.slice(3), code: "Numpad" + t.slice(3) };
    if (/^F\d{1,2}$/i.test(t)) return { key: t.toUpperCase(), code: t.toUpperCase() };
    const named = {
      escape: ["Escape", "Escape"], esc: ["Escape", "Escape"], enter: ["Enter", "Enter"], return: ["Enter", "Enter"],
      tab: ["Tab", "Tab"], space: [" ", "Space"], backspace: ["Backspace", "Backspace"],
      delete: ["Delete", "Delete"], del: ["Delete", "Delete"], insert: ["Insert", "Insert"],
      home: ["Home", "Home"], end: ["End", "End"], pageup: ["PageUp", "PageUp"], pagedown: ["PageDown", "PageDown"],
      arrowup: ["ArrowUp", "ArrowUp"], arrowdown: ["ArrowDown", "ArrowDown"], arrowleft: ["ArrowLeft", "ArrowLeft"], arrowright: ["ArrowRight", "ArrowRight"],
      up: ["ArrowUp", "ArrowUp"], down: ["ArrowDown", "ArrowDown"], left: ["ArrowLeft", "ArrowLeft"], right: ["ArrowRight", "ArrowRight"]
    };
    const n = named[t.toLowerCase()];
    return n ? { key: n[0], code: n[1] } : { key: t, code: t };
  }
  function legacyKeyCode(code) {
    const map = { Escape: 27, Enter: 13, Tab: 9, Space: 32, Backspace: 8, Delete: 46, Insert: 45,
      Home: 36, End: 35, PageUp: 33, PageDown: 34, ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39 };
    if (map[code]) return map[code];
    let m = /^Key([A-Z])$/.exec(code); if (m) return m[1].charCodeAt(0);
    m = /^Digit(\d)$/.exec(code); if (m) return 48 + Number(m[1]);
    m = /^F(\d{1,2})$/.exec(code); if (m) return 111 + Number(m[1]);
    return 0;
  }
  function parseKeyLabel(label) {
    const toks = String(label).split("+").map((t) => t.trim()).filter(Boolean);
    const out = { ctrl: false, alt: false, shift: false, meta: false };
    for (const t of toks.slice(0, -1)) {
      const l = t.toLowerCase();
      if (l === "ctrl" || l === "control") out.ctrl = true;
      else if (l === "alt" || l === "option") out.alt = true;
      else if (l === "shift") out.shift = true;
      else if (l === "meta" || l === "cmd" || l === "win") out.meta = true;
    }
    const kc = nameToKeyCode(toks[toks.length - 1] || "");
    return { ...out, key: kc.key, code: kc.code, keyCode: legacyKeyCode(kc.code) };
  }
  function pressKey(step) {
    const info = parseKeyLabel(step.label);
    const el = (document.activeElement && document.activeElement !== document.body)
      ? document.activeElement : (document.body || document.documentElement);
    const init = { key: info.key, code: info.code, bubbles: true, cancelable: true, composed: true,
      ctrlKey: info.ctrl, altKey: info.alt, shiftKey: info.shift, metaKey: info.meta };
    for (const type of ["keydown", "keypress", "keyup"]) {
      if (type === "keypress" && info.code !== "Enter" && info.code !== "Space") continue;
      let ev;
      try { ev = new KeyboardEvent(type, init); } catch (_) { ev = new KeyboardEvent(type); }
      try {
        Object.defineProperty(ev, "keyCode", { get: () => info.keyCode });
        Object.defineProperty(ev, "which", { get: () => info.keyCode });
      } catch (_) {}
      el.dispatchEvent(ev);
    }
  }

  // ---------- parse a shared .txt preset (same syntax as the editor) ----------
  function splitDelay(line) {
    const m = /^(.*?)\s*\(\s*delay\s+(\d+)\s*(ms|s)?\s*\)\s*$/i.exec(line);
    if (!m) return [line, 0];
    let n = parseInt(m[2], 10);
    if ((m[3] || "s").toLowerCase() === "s") n *= 1000;
    return [m[1].trim(), n];
  }
  function parseSteps(text) {
    return text.split("\n").map((line) => {
      const t = line.trim();
      if (!t) return null;
      const [rest, delayMs] = splitDelay(t);
      const k = /^key:\s*(.+)$/i.exec(rest);
      if (k) { const s = { type: "key", label: k[1].trim() }; if (delayMs) s.delayMs = delayMs; return s; }
      const c = /^clear:\s*(.+)$/i.exec(rest);
      if (c) { const s = { type: "clear", label: c[1].trim() }; if (delayMs) s.delayMs = delayMs; return s; }
      const m = /^@\s*(.+?)\s*=\s*(.*)$/.exec(rest);
      if (m) { const s = { type: "input", label: m[1].trim(), value: m[2] }; if (delayMs) s.delayMs = delayMs; return s; }
      if (delayMs) return { type: "click", text: rest, delayMs };
      return rest;
    }).filter((s) => s !== null);
  }
  const GROUP_RE = /^#+\s*group\s*:\s*(.*)$/i;   // "# group: Front Desk" directive line
  function parsePresetFile(text, fallbackName) {
    const lines = text.replace(/\r\n?/g, "\n").split("\n");
    let name = null, group = "";
    const stepLines = [];
    for (const line of lines) {
      const t = line.trim();
      if (t.startsWith("#")) {
        const gm = GROUP_RE.exec(t);
        if (gm) { group = gm[1].trim(); continue; }
        if (name === null) name = t.replace(/^#+\s*/, "").trim();
        continue;
      }
      stepLines.push(line);
    }
    const out = { name: name || fallbackName || "Imported preset", steps: parseSteps(stepLines.join("\n")) };
    if (group) out.group = group;
    return out;
  }
  // A file may hold many presets, each starting with a "# Name" line.
  // A "# group: X" line sets the group of the current preset (not a new preset).
  function parseBundle(text) {
    const lines = text.replace(/\r\n?/g, "\n").split("\n");
    const groups = [];
    let cur = null;
    for (const line of lines) {
      const t = line.trim();
      if (t.startsWith("#")) {
        const gm = GROUP_RE.exec(t);
        if (gm) { if (cur) cur.group = gm[1].trim(); continue; }
        cur = { name: t.replace(/^#+\s*/, "").trim() || "Preset", lines: [] }; groups.push(cur); continue;
      }
      if (!cur) { cur = { name: "Preset", lines: [] }; groups.push(cur); }
      cur.lines.push(line);
    }
    return groups
      .map((g) => { const o = { name: g.name, steps: parseSteps(g.lines.join("\n")) }; if (g.group) o.group = g.group; return o; })
      .filter((p) => p.steps.length);
  }
  // First-install defaults bundled in the folder as default-presets.txt.
  async function loadBundledDefaults() {
    try {
      const res = await fetch(chrome.runtime.getURL("default-presets.txt"));
      if (!res.ok) return null;
      return parseBundle(await res.text());
    } catch (_) { return null; }
  }

  function isEditableField(el) {
    if (!el || !el.tagName) return false;
    if (el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
    if (el.tagName === "INPUT") {
      const t = (el.type || "text").toLowerCase();
      return !["button", "submit", "reset", "image", "file"].includes(t);
    }
    return false;
  }

  // When the same label exists in a popup AND behind it, prefer the field that is
  // actually in front: inside a dialog/popup, and not covered by a modal overlay.
  function frontScore(el) {
    let s = 0;
    const dlg = el.closest('[role="dialog"], .af_dialog, .af_panelWindow, .af_panelPopup, .af_popup, .p_AFPopup');
    if (dlg) {
      s += 1000;
      const z = parseInt(getComputedStyle(dlg).zIndex, 10);
      if (z > 0) s += Math.min(z, 100000) / 1000;
    }
    // Hit-test: the field behind a modal is covered by the glass pane, so the
    // element at its own centre point is NOT itself -> it loses to the popup field.
    try {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      if (cx >= 0 && cy >= 0 && cx <= innerWidth && cy <= innerHeight) {
        const hit = document.elementFromPoint(cx, cy);
        if (hit && (hit === el || el.contains(hit) || hit.contains(el))) s += 500;
      }
    } catch (_) {}
    return s;
  }

  // Locate a field by its visible label text (ADF uses <label for="id">).
  // If several match (e.g. a popup over the page), pick the front-most one.
  function findInputByLabel(label) {
    const want = norm(label);
    if (!want) return null;
    const cands = [];
    for (const l of document.querySelectorAll("label[for]")) {
      if (norm(l.textContent) !== want) continue;
      const el = document.getElementById(l.getAttribute("for"));
      if (el && isEditableField(el) && isVisible(el)) cands.push(el);
    }
    if (!cands.length) {
      for (const el of document.querySelectorAll("input,textarea,select")) {
        if (!isEditableField(el) || !isVisible(el)) continue;
        if (norm(el.getAttribute("aria-label")) === want || norm(el.placeholder) === want) cands.push(el);
      }
    }
    if (!cands.length) return null;
    if (cands.length === 1) return cands[0];
    const isAfter = (a, b) => !!(b.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING);
    let best = cands[0], bestScore = frontScore(best);
    for (let i = 1; i < cands.length; i++) {
      const sc = frontScore(cands[i]);
      // higher score wins; on a tie prefer the later element (popups render last)
      if (sc > bestScore || (sc === bestScore && isAfter(cands[i], best))) { best = cands[i]; bestScore = sc; }
    }
    return best;
  }

  function waitForInput(label, timeout = 10000, runId) {
    return new Promise((resolve) => {
      const f = findInputByLabel(label);
      if (f) return resolve(f);
      const start = Date.now();
      const iv = setInterval(() => {
        if (runId != null && runId !== currentRun) { clearInterval(iv); resolve(null); return; }
        const el = findInputByLabel(label);
        if (el) { clearInterval(iv); resolve(el); }
        else if (Date.now() - start > timeout) { clearInterval(iv); resolve(null); }
      }, 100);
    });
  }

  // Read a field's current value in a form suitable for storage.
  function readFieldValue(el) {
    const t = (el.type || "").toLowerCase();
    if (t === "checkbox" || t === "radio") return el.checked;
    return el.value;
  }

  // Set a field's value using the native setter so frameworks notice, then
  // fire the events an app listens for.
  function setFieldValue(el, value) {
    try { el.focus({ preventScroll: true }); } catch (_) {}
    const t = (el.type || "").toLowerCase();
    if (t === "checkbox" || t === "radio") {
      el.checked = value === true || value === "true";
    } else {
      const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype
        : el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
      setter.call(el, value == null ? "" : String(value));
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    // Note: deliberately NOT calling el.blur() — an explicit blur makes OPERA's
    // ADF partial-refresh revert the field. A natural blur (the next step moving
    // focus) is fine and keeps the value.
  }

  // Delete the text in a field. Select-all + delete first (clears ADF
  // autocomplete/LOV fields that a plain value="" can leave populated), then
  // force empty via the native setter and fire the change events.
  function clearField(el) {
    try { el.focus({ preventScroll: true }); } catch (_) {}
    const t = (el.type || "").toLowerCase();
    if (t === "checkbox" || t === "radio") {
      el.checked = false;
    } else {
      try { if (el.select) el.select(); document.execCommand && document.execCommand("delete"); } catch (_) {}
      const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype
        : el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, "");
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function runPreset(preset) {
    const myRun = ++currentRun;    // claim this run; double-Esc bumps currentRun to abort
    runActive = true;
    closePanel();
    root.classList.add("oshort-running");
    try {
      for (let i = 0; i < preset.steps.length; i++) {
        if (myRun !== currentRun) return;   // aborted
        const step = preset.steps[i];
        const label = stepText(step);
        showProgress(preset.name, i + 1, preset.steps.length, stepDesc(step));
        await waitForReady(15000, myRun);   // don't act until OPERA has finished loading
        if (myRun !== currentRun) return;
        if (isInputStep(step)) {
          const field = await waitForInput(step.label, 10000, myRun);
          if (myRun !== currentRun) return;
          if (!field) { toast(`Couldn't find field "${step.label}". Stopped.`, true); return; }
          setFieldValue(field, step.value);
        } else if (isClearStep(step)) {
          const field = await waitForInput(step.label, 10000, myRun);
          if (myRun !== currentRun) return;
          if (!field) { toast(`Couldn't find field "${step.label}". Stopped.`, true); return; }
          clearField(field);
        } else if (isKeyStep(step)) {
          pressKey(step);
        } else {
          const el = await waitForText(label, 10000, myRun);
          if (myRun !== currentRun) return;
          if (!el) { toast(`Couldn't find "${label}". Stopped.`, true); return; }
          fireClick(el);
        }
        // Give the action a moment to register as "busy" before the next step's
        // waitForReady() waits for it to finish (covers both PPR loads and the
        // client-side menu flyouts that open with no server round-trip).
        await waitMs(200, myRun);
        // Optional per-step extra pause (the "(delay 1s)" directive) for controls
        // that report ready before they are actually interactive.
        const extra = stepDelay(step);
        if (extra) await waitMs(extra, myRun);
      }
      if (myRun !== currentRun) return;
      await waitForReady(15000, myRun);
      toast("Done · " + preset.name, "ok");
    } finally {
      // Only clear the flag if we still own the run (a newer run or an abort
      // may have taken over).
      if (myRun === currentRun) { runActive = false; root.classList.remove("oshort-running"); }
    }
  }
  // Human label for the progress card. Typed values are never shown (PINs etc.).
  function stepDesc(step) {
    if (isInputStep(step)) return "Type into " + step.label;
    if (isClearStep(step)) return "Clear " + step.label;
    if (isKeyStep(step)) return "Press " + step.label;
    return "Click " + stepText(step);
  }

  // ---------- UI ----------
  let presets = [];
  let root, fab, panel, searchEl, listEl, recEl, capList, recCount, nameInput, saveBtn, toastEl, fileInput;
  let recording = false;
  let captured = [];
  let query = "";      // palette filter text
  let sel = 0;         // highlighted row in the palette
  let visible = [];    // presets currently shown (filtered), in display order

  function h(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function build() {
    root = h("div", "");
    root.id = "oshort-root";

    fab = h("button", "");
    fab.id = "oshort-fab";
    fab.type = "button";
    fab.innerHTML = "<span>OS</span>";
    fab.title = "OPERA Shortcut  (Ctrl+K)";

    // Command-palette panel: search on top, keyboard-driven list, actions below.
    panel = h("div", "");
    panel.id = "oshort-panel";
    panel.innerHTML =
      '<div class="os-head">' +
        '<span class="os-search-ico">' + ICON.search + '</span>' +
        '<input class="os-search" type="text" placeholder="Run a preset…" spellcheck="false" autocomplete="off" />' +
        '<button type="button" class="os-ib os-theme"></button>' +
        '<button type="button" class="os-ib os-gear" title="Edit presets">' + ICON.gear + '</button>' +
      '</div>' +
      '<div class="os-list" role="listbox"></div>' +
      '<div class="os-foot">' +
        '<button type="button" class="os-fbtn os-add" title="Record a new preset"><span class="os-rec-ico">' + ICON.dot + '</span>Record</button>' +
        '<button type="button" class="os-fbtn os-upload" title="Run a shared .txt preset without saving it">' + ICON.upload + 'Run file</button>' +
        '<span class="os-hint"><kbd>↑</kbd><kbd>↓</kbd><kbd>↵</kbd></span>' +
      '</div>';
    searchEl = panel.querySelector(".os-search");
    listEl = panel.querySelector(".os-list");

    recEl = h("div", "");
    recEl.id = "oshort-rec";
    recEl.innerHTML =
      '<div class="os-rec-head"><span class="os-dot"></span><b>Recording</b><span class="os-rec-count">0 steps</span>' +
        '<button type="button" class="os-ib os-cancel" title="Cancel recording">' + ICON.x + '</button></div>' +
      '<ol class="os-cap"></ol>' +
      '<div class="os-rec-foot">' +
        '<input class="os-rec-name" placeholder="Name this preset" spellcheck="false" />' +
        '<button type="button" class="os-save" disabled>Save</button>' +
      '</div>';
    capList = recEl.querySelector(".os-cap");
    recCount = recEl.querySelector(".os-rec-count");
    nameInput = recEl.querySelector(".os-rec-name");
    saveBtn = recEl.querySelector(".os-save");

    toastEl = h("div", "");
    toastEl.id = "oshort-toast";

    fileInput = h("input", "");
    fileInput.type = "file";
    fileInput.accept = ".txt,text/plain";
    fileInput.hidden = true;

    root.append(panel, recEl, toastEl, fab, fileInput);
    document.documentElement.appendChild(root);

    fab.addEventListener("click", onFabClick);
    panel.querySelector(".os-gear").addEventListener("click", () => {
      closePanel();
      try { chrome.runtime.sendMessage({ type: "openOptions" }); } catch (_) {}
    });
    panel.querySelector(".os-theme").addEventListener("click", () => setTheme(theme === "dark" ? "light" : "dark"));
    panel.querySelector(".os-add").addEventListener("click", startRecording);
    panel.querySelector(".os-upload").addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", onUploadRun);
    recEl.querySelector(".os-cancel").addEventListener("click", () => stopRecording(false));
    saveBtn.addEventListener("click", () => stopRecording(true));
    nameInput.addEventListener("input", () => { saveBtn.disabled = !nameInput.value.trim() || !captured.length; });
    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !saveBtn.disabled) stopRecording(true);
      e.stopPropagation();   // keep OPERA's own key handlers out of our input
    });

    searchEl.addEventListener("input", () => { query = searchEl.value; sel = 0; renderList(); });
    searchEl.addEventListener("keydown", onSearchKey);
    searchEl.addEventListener("keyup", (e) => e.stopPropagation());
    searchEl.addEventListener("keypress", (e) => e.stopPropagation());
    // Click anywhere outside the panel closes it.
    document.addEventListener("mousedown", (e) => {
      if (root.classList.contains("oshort-open") && !root.contains(e.target)) closePanel();
    }, true);

    enableDrag();
    applyTheme();
    renderList();
  }

  const groupOf = (p) => (p && p.group) || "";
  // Same stable ordering as options.js regroup(): each group's presets contiguous,
  // groups in first-seen order. Keeps the palette and positional Alt+N identical
  // to what the options page shows, even if storage holds an interleaved list.
  function regroup(list) {
    const order = [], buckets = new Map();
    (list || []).forEach((p) => {
      const g = groupOf(p);
      if (!buckets.has(g)) { buckets.set(g, []); order.push(g); }
      buckets.get(g).push(p);
    });
    return order.reduce((acc, g) => acc.concat(buckets.get(g)), []);
  }
  function hotkeyLabel(p, idx) {
    if (p.hotkey && p.hotkey.label) return p.hotkey.label;
    return idx < 9 ? "Alt+" + (idx + 1) : "";
  }
  function kbdHTML(label) {
    return String(label).split("+").map((k) => `<kbd>${escapeHtml(k)}</kbd>`).join("");
  }

  function renderList() {
    listEl.innerHTML = "";
    if (!presets.length) {
      visible = [];
      listEl.appendChild(h("div", "os-empty", "No presets yet.<br>Record one, or add them in settings."));
      return;
    }
    const q = norm(query);
    visible = presets.filter((p) => !q || norm(p.name + " " + groupOf(p)).includes(q));
    if (!visible.length) {
      listEl.appendChild(h("div", "os-empty", "No presets match “" + escapeHtml(query) + "”"));
      return;
    }
    if (sel >= visible.length) sel = visible.length - 1;
    if (sel < 0) sel = 0;
    const hasGroups = presets.some((p) => groupOf(p) !== "");
    let last = null;
    visible.forEach((p, vi) => {
      const g = groupOf(p);
      if (hasGroups && g !== last) {
        last = g;
        const n = visible.filter((x) => groupOf(x) === g).length;
        listEl.appendChild(h("div", "os-group", `<span>${escapeHtml(g || "Ungrouped")}</span><span>${n}</span>`));
      }
      const hk = hotkeyLabel(p, presets.indexOf(p));
      const item = h("div", "os-item" + (vi === sel ? " os-sel" : ""),
        `<span class="os-name">${escapeHtml(p.name)}</span>` +
        (hk ? `<span class="os-keys${p.hotkey ? " os-custom" : ""}">${kbdHTML(hk)}</span>` : "") +
        `<button type="button" class="os-ib os-del" title="Delete preset">${ICON.x}</button>`);
      item.setAttribute("role", "option");
      // mousemove (not mouseenter) so keyboard scrolling doesn't steal the highlight
      item.addEventListener("mousemove", () => { if (sel !== vi) { sel = vi; markSel(false); } });
      item.addEventListener("click", (e) => {
        if (e.target.closest(".os-del")) {
          e.stopPropagation();
          if (!confirm(`Delete preset "${p.name}"?`)) return;
          const i = presets.indexOf(p);
          if (i !== -1) presets.splice(i, 1);
          store.set(presets);
          renderList();
          searchEl.focus();
          return;
        }
        runPreset(p);
      });
      listEl.appendChild(item);
    });
  }
  function markSel(scroll) {
    const items = listEl.querySelectorAll(".os-item");
    items.forEach((it, k) => it.classList.toggle("os-sel", k === sel));
    if (scroll && items[sel]) items[sel].scrollIntoView({ block: "nearest" });
  }
  // Palette keys: ↑/↓ move, Enter runs, Esc clears the search or closes.
  function onSearchKey(e) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (visible.length) {
        sel = (sel + (e.key === "ArrowDown" ? 1 : -1) + visible.length) % visible.length;
        markSel(true);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      const p = visible[sel];
      if (p) runPreset(p);
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (query) { query = ""; searchEl.value = ""; sel = 0; renderList(); }
      else closePanel();
    }
    e.stopPropagation();   // keep OPERA's own key handlers out of our search box
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // Upload a shared .txt preset and run it immediately (not saved).
  async function onUploadRun() {
    const f = fileInput.files && fileInput.files[0];
    fileInput.value = ""; // allow re-uploading the same file later
    if (!f) return;
    let text;
    try { text = await f.text(); } catch (_) { toast("Couldn't read that file.", true); return; }
    const preset = parsePresetFile(text, f.name.replace(/\.txt$/i, ""));
    if (!preset.steps.length) { toast("No steps found in that file.", true); return; }
    runPreset(preset); // closes the panel and plays the steps
  }

  function openPanel() {
    root.classList.add("oshort-open");
    query = ""; searchEl.value = ""; sel = 0;
    renderList();
    setTimeout(() => { try { searchEl.focus({ preventScroll: true }); } catch (_) {} }, 0);
  }
  function closePanel() { if (root) root.classList.remove("oshort-open"); }
  function togglePanel() {
    if (recording) return;
    if (root.classList.contains("oshort-open")) closePanel(); else openPanel();
  }
  function onFabClick() {
    if (root.__dragged) { root.__dragged = false; return; } // ignore click after drag
    togglePanel();
  }

  // ---------- recorder ----------
  // Append a step and its list row. Steps: string (click) or {type:"input",...}.
  const TAG = { click: "Click", input: "Type", clear: "Clear", key: "Key" };
  function pushStep(step) {
    captured.push(step);
    const kind = isInputStep(step) ? "input" : isClearStep(step) ? "clear" : isKeyStep(step) ? "key" : "click";
    const text = kind === "input" ? `${escapeHtml(step.label)} <i>=</i> ${escapeHtml(String(step.value))}`
      : kind === "click" ? escapeHtml(step) : escapeHtml(step.label);
    const li = h("li", "", `<span class="os-tag os-t-${kind}">${TAG[kind]}</span><span class="os-cap-text">${text}</span>`);
    capList.appendChild(li);
    capList.scrollTop = capList.scrollHeight;
    recCount.textContent = captured.length + (captured.length === 1 ? " step" : " steps");
    saveBtn.disabled = !nameInput.value.trim();
  }

  function renderCaptured() {
    const steps = captured.slice();
    captured = [];
    capList.innerHTML = "";
    recCount.textContent = "0 steps";
    steps.forEach(pushStep);
  }

  function onCapture(e) {
    if (!recording) return;
    const t = e.target;
    if (t.closest && t.closest("#oshort-root")) return; // ignore our UI
    if (isEditableField(t)) return;                     // typed fields handled on change
    const disp = displayText(t);
    if (!disp) return;
    pushStep(disp);
  }

  // Record action keys (Esc/Enter/Tab/arrows/F-keys and any Ctrl/Alt/Meta combo).
  // Plain typing is captured as an input step, so it is skipped here.
  function isRecordableKey(e) {
    if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return false; // lone modifier
    if (e.ctrlKey || e.altKey || e.metaKey) return true;                    // any combo
    const named = ["Escape", "Enter", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
      "PageUp", "PageDown", "Home", "End", "Delete", "Insert"];
    return named.includes(e.key) || /^F\d{1,2}$/.test(e.key);
  }
  function onKeyCapture(e) {
    if (!recording) return;
    const t = e.target;
    if (t && t.closest && t.closest("#oshort-root")) return; // ignore typing in our own UI
    if (!isRecordableKey(e)) return;
    pushStep({ type: "key", label: labelFromKeyEvent(e) });
  }

  function fieldLabelText(el) {
    if (el.id) {
      const sel = window.CSS && CSS.escape ? `label[for="${CSS.escape(el.id)}"]` : null;
      const l = sel && document.querySelector(sel);
      const tx = l && (l.textContent || "").replace(/\s+/g, " ").trim();
      if (tx) return tx;
    }
    return (el.getAttribute("aria-label") || el.placeholder || "").replace(/\s+/g, " ").trim();
  }

  function onFieldChange(e) {
    if (!recording) return;
    const el = e.target;
    if (!isEditableField(el) || (el.closest && el.closest("#oshort-root"))) return;
    const label = fieldLabelText(el);
    if (!label) return;
    const value = readFieldValue(el);
    // Update an existing step for the same field; otherwise add a new one.
    for (let i = captured.length - 1; i >= 0; i--) {
      if (isInputStep(captured[i]) && norm(captured[i].label) === norm(label)) {
        captured[i].value = value;
        renderCaptured();
        return;
      }
    }
    if (value === "" || value === false) return; // ignore untouched/empty fields
    pushStep({ type: "input", label, value });
  }

  function displayText(t) {
    const mi = t.closest && t.closest('[role="menuitem"]');
    const el = mi || t;
    let txt = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (!txt || txt.length > 60) txt = (t.textContent || "").replace(/\s+/g, " ").trim();
    return txt.length > 60 ? txt.slice(0, 60) : txt;
  }

  function startRecording() {
    recording = true;
    captured = [];
    capList.innerHTML = "";
    recCount.textContent = "0 steps";
    nameInput.value = "";
    saveBtn.disabled = true;
    root.classList.remove("oshort-open");
    root.classList.add("oshort-recording");
    // capture phase so we see the click before ADF possibly stops propagation
    document.addEventListener("click", onCapture, true);
    document.addEventListener("change", onFieldChange, true);
    document.addEventListener("keydown", onKeyCapture, true);
  }

  async function stopRecording(save) {
    document.removeEventListener("click", onCapture, true);
    document.removeEventListener("change", onFieldChange, true);
    document.removeEventListener("keydown", onKeyCapture, true);
    recording = false;
    root.classList.remove("oshort-recording");
    if (save && captured.length && nameInput.value.trim()) {
      const name = nameInput.value.trim();
      presets.push({ name, steps: captured.slice() });
      presets = regroup(presets);
      await store.set(presets);
      toast("Saved · " + name, "ok");
    }
    captured = [];
    openPanel();
  }

  // ---------- toast + run progress card ----------
  let toastTimer;
  // kind: undefined | "ok" | "err" (true is accepted as "err").
  function toast(msg, kind) {
    if (kind === true) kind = "err";
    clearTimeout(toastTimer);
    const ico = kind === "err" ? ICON.alert : kind === "ok" ? ICON.check : "";
    toastEl.className = "os-show" + (kind ? " os-" + kind : "");
    toastEl.innerHTML = '<div class="os-t-row">' + (ico ? '<span class="os-t-ico">' + ico + "</span>" : "") +
      '<span class="os-t-msg">' + escapeHtml(msg) + "</span></div>";
    toastTimer = setTimeout(() => { toastEl.className = ""; }, kind === "err" ? 4500 : 2200);
  }
  // Live card while a preset runs: name, step i/n, what it's doing, progress bar.
  function showProgress(name, i, n, desc) {
    clearTimeout(toastTimer);
    toastEl.className = "os-show os-run";
    // Reuse the card between steps so the bar animates instead of resetting.
    if (!toastEl.querySelector(".os-t-bar")) {
      toastEl.innerHTML =
        '<div class="os-t-row"><span class="os-spin"></span><span class="os-t-msg"></span><span class="os-t-count"></span></div>' +
        '<div class="os-t-sub"></div><div class="os-t-bar"><i></i></div>' +
        '<div class="os-t-hint"><kbd>Esc</kbd><kbd>Esc</kbd> to stop</div>';
    }
    toastEl.querySelector(".os-t-msg").textContent = name;
    toastEl.querySelector(".os-t-count").textContent = i + "/" + n;
    toastEl.querySelector(".os-t-sub").textContent = desc;
    toastEl.querySelector(".os-t-bar i").style.width = Math.round(((i - 1) / n) * 100) + "%";
  }

  // ---------- drag ----------
  function enableDrag() {
    let sx, sy, sr, sb, moved;
    fab.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const rect = root.getBoundingClientRect();
      sr = window.innerWidth - rect.right;
      sb = window.innerHeight - rect.bottom;
      sx = e.clientX; sy = e.clientY; moved = false;
      root.classList.add("oshort-dragging");
      fab.setPointerCapture(e.pointerId);
    });
    fab.addEventListener("pointermove", (e) => {
      if (!root.classList.contains("oshort-dragging")) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      root.style.right = Math.max(4, sr - dx) + "px";
      root.style.bottom = Math.max(4, sb - dy) + "px";
    });
    const end = (e) => {
      if (!root.classList.contains("oshort-dragging")) return;
      root.classList.remove("oshort-dragging");
      root.__dragged = moved;
      try { fab.releasePointerCapture(e.pointerId); } catch (_) {}
    };
    fab.addEventListener("pointerup", end);
    fab.addEventListener("pointercancel", end);
  }

  // ---------- keyboard shortcuts (Alt + preset position) ----------
  function hkMatches(e, hk) {
    return !!e.ctrlKey === !!hk.ctrl && !!e.altKey === !!hk.alt &&
           !!e.shiftKey === !!hk.shift && !!e.metaKey === !!hk.meta && e.code === hk.code;
  }
  function onHotkey(e) {
    if (recording) return;
    if (!e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) return; // need a real modifier
    // 1) a preset's custom shortcut wins
    for (const p of presets) {
      if (p.hotkey && hkMatches(e, p.hotkey)) {
        e.preventDefault(); e.stopPropagation(); runPreset(p); return;
      }
    }
    // Ctrl/⌘+K toggles the preset palette
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.code === "KeyK") {
      e.preventDefault(); e.stopPropagation(); togglePanel(); return;
    }
    // 2) default: Alt+1..9 by position, but only for presets without a custom one
    if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      const m = /^Digit([1-9])$/.exec(e.code);
      if (m) {
        const idx = parseInt(m[1], 10) - 1;
        const p = presets[idx];
        if (p && !p.hotkey) { e.preventDefault(); e.stopPropagation(); runPreset(p); }
      }
    }
  }

  // Double-press Esc (within 600ms) to abort a running preset. Only real user
  // key presses count (e.isTrusted) — synthetic Escape key-steps fired by a
  // preset during replay are ignored, so a preset can't cancel itself.
  let lastEsc = 0;
  function onEscAbort(e) {
    if (e.key !== "Escape" || !e.isTrusted) return;
    if (!runActive) { lastEsc = 0; return; }
    const now = Date.now();
    if (now - lastEsc < 600) { lastEsc = 0; abortRun(); }
    else { lastEsc = now; }
  }

  // ---------- init ----------
  (async function init() {
    let saved = await store.get();
    if (!saved) {
      // First install on this profile: seed from the bundled default-presets.txt
      // if present, otherwise the built-in single default.
      saved = await loadBundledDefaults();
      if (!saved || !saved.length) saved = DEFAULT_PRESETS.slice();
      await store.set(saved);
    }
    presets = regroup(saved);
    theme = await getTheme();
    build();
    document.addEventListener("keydown", onHotkey, true);
    document.addEventListener("keydown", onEscAbort, true);
    // Reflect edits made on the options page (or the recorder) without reload.
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes[STORAGE_KEY]) {
        presets = regroup(changes[STORAGE_KEY].newValue || []);
        if (listEl) renderList();
      }
      if (changes[THEME_KEY]) {
        theme = changes[THEME_KEY].newValue === "light" ? "light" : "dark";
        applyTheme();
      }
    });
  })();
})();
