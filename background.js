/* OShort service worker: opens the options page, and mirrors presets + theme between
   chrome.storage.local (the working copy every page reads/writes) and
   chrome.storage.sync (Chrome's per-Google-account sync, shared by every PC signed into
   the same account). Pages keep writing local on every keystroke; this worker pushes to
   sync on a debounce, which keeps us under sync's write-rate quota. */
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "openOptions") chrome.runtime.openOptionsPage();
});

// ---------- sync ----------
const STORAGE_KEY = "oshort_presets";
const THEME_KEY = "oshort_theme";
const LAST_KEY = "oshort_sync_last";   // local: JSON both sides last agreed on
const SEED_KEY = "oshort_seed";        // local: JSON content.js seeded on first install
const ERROR_KEY = "oshort_sync_error"; // local: last push error (shown on the options page)
const META_KEY = "oshort_presets_meta"; // sync: { n: chunk count, ts }
const CHUNK = (i) => "oshort_presets_" + i; // sync: JSON string pieces
const MAX_ITEM_BYTES = 7800;            // sync allows 8192 bytes per item (key + JSON value)

const local = chrome.storage.local, sync = chrome.storage.sync;
const bytes = (s) => new TextEncoder().encode(s).length;

// Split the presets JSON so every stored piece fits under the per-item quota.
function chunk(str) {
  const out = [];
  for (let i = 0; i < str.length;) {
    let n = Math.min(6000, str.length - i);
    while (n > 1 && bytes(JSON.stringify(str.slice(i, i + n))) > MAX_ITEM_BYTES) n = Math.floor(n * 0.8);
    out.push(str.slice(i, i + n));
    i += n;
  }
  return out;
}

// Presets JSON from sync; null = nothing stored; undefined = incomplete (chunks from
// another PC still arriving) — try again on the next change event.
async function readSync() {
  const { [META_KEY]: meta } = await sync.get(META_KEY);
  if (!meta || !meta.n) return null;
  const keys = Array.from({ length: meta.n }, (_, i) => CHUNK(i));
  const o = await sync.get(keys);
  if (keys.some((k) => typeof o[k] !== "string")) return undefined;
  const json = keys.map((k) => o[k]).join("");
  try { return Array.isArray(JSON.parse(json)) ? json : undefined; } catch (_) { return undefined; }
}

async function push(json) {
  const { [META_KEY]: old } = await sync.get(META_KEY);
  const parts = chunk(json);
  const items = { [META_KEY]: { n: parts.length, ts: Date.now() } };
  parts.forEach((p, i) => { items[CHUNK(i)] = p; });
  try {
    await sync.set(items);
  } catch (e) {
    // Usually the 100 KB total limit: presets stay saved on this PC, just not synced.
    await local.set({ [ERROR_KEY]: String((e && e.message) || e) });
    return;
  }
  const stale = [];
  for (let i = parts.length; i < ((old && old.n) || 0); i++) stale.push(CHUNK(i));
  if (stale.length) await sync.remove(stale);
  await local.set({ [LAST_KEY]: json });
  await local.remove(ERROR_KEY);
}

async function pull(json) {
  await local.set({ [STORAGE_KEY]: JSON.parse(json), [LAST_KEY]: json });
}

async function reconcilePresets() {
  const S = await readSync();
  if (S === undefined) return;
  const o = await local.get([STORAGE_KEY, LAST_KEY, SEED_KEY]);
  const L = Array.isArray(o[STORAGE_KEY]) ? JSON.stringify(o[STORAGE_KEY]) : null;
  const last = o[LAST_KEY], seed = o[SEED_KEY];
  if (S === null) {
    // Nothing in the account yet. Don't upload the first-install seed: this PC's sync
    // data may simply not have downloaded yet, and the seed would overwrite it.
    if (L !== null && L !== seed) await push(L);
    return;
  }
  if (L === S) { if (last !== S) await local.set({ [LAST_KEY]: S }); return; }
  // Never synced here, or only the seed / unchanged since last sync -> take the account's.
  if (L === null || last == null || L === seed || L === last) { await pull(S); return; }
  // Only this PC changed -> upload.
  if (S === last) { await push(L); return; }
  // Both changed since the last sync (rare): the account's copy wins.
  await pull(S);
}

async function reconcileTheme() {
  const [{ [THEME_KEY]: s }, { [THEME_KEY]: l }] = await Promise.all([sync.get(THEME_KEY), local.get(THEME_KEY)]);
  if (s === l) return;
  if (s && lastThemeFrom === "sync") await local.set({ [THEME_KEY]: s });
  else if (l) await sync.set({ [THEME_KEY]: l });
  else if (s) await local.set({ [THEME_KEY]: s });
}

// One reconcile at a time, debounced so bursts (typing, multi-chunk arrivals) coalesce.
let timer = null, running = Promise.resolve(), lastThemeFrom = "sync";
function schedule(ms) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    running = running
      .then(() => Promise.all([reconcilePresets(), reconcileTheme()]))
      .catch((e) => console.warn("OShort sync:", e));
  }, ms);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") {
    if (changes[STORAGE_KEY]) schedule(2000);
    if (changes[THEME_KEY]) { lastThemeFrom = "local"; schedule(2000); }
  } else if (area === "sync") {
    if (changes[THEME_KEY]) lastThemeFrom = "sync";
    if (Object.keys(changes).some((k) => k === META_KEY || k === THEME_KEY || k.startsWith("oshort_presets_"))) schedule(500);
  }
});

// Catch up whenever the worker starts (browser start, install/reload, any wake-up).
schedule(500);
