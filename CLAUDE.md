# OPERA Shortcut (OShort) — project context

A Chrome MV3 extension that adds a floating button + keyboard shortcuts to **Oracle
OPERA Cloud** for replaying preset sequences of UI actions (click menus, type into
fields, clear fields, press keys). Built for hotel front-office / finance workflows.

Current version lives in `manifest.json` (`"version"`). See `VERSION.md` for the full
changelog.

## Golden rule — versioning (do this on EVERY change)
On any code/data change: bump `manifest.json` `version` (semver: feature = minor,
fix/UI tweak = patch) AND prepend an entry to `VERSION.md` (what changed + files).
Remind the user a manifest version change needs a full **reload** at
`chrome://extensions` (↻), not just a page refresh. (Also recorded in Claude memory.)

## Files
- `manifest.json` — MV3. Scoped to `https://*.oraclecloud.com/*` and
  `https://*.oraclehospitality.com/*`. Perms: `storage`. Two content scripts (see
  Architecture), a background service worker, `options_ui`, a toolbar `action`,
  `web_accessible_resources` for `default-presets.txt`, and app icons.
- `content.js` — isolated-world content script. The floating panel UI, the preset
  runner (replay engine), the recorder, keyboard-shortcut listener, and the `.txt`
  parser. This is the core file.
- `bridge.js` — runs in the PAGE world (`"world":"MAIN"`). Publishes OPERA/ADF's busy
  state to `document.documentElement[data-oshort-ready]` = "1"/"0". Needed because an
  isolated content script can't see `window.AdfPage`.
- `background.js` — service worker; only opens the options page (toolbar click / a
  message from the panel gear).
- `options.html` / `options.js` — the options page: structured per-preset editor,
  import/export, editable shortcuts.
- `styles.css` — floating panel/recorder/toast styling.
- `default-presets.txt` — first-install seed presets (see Storage). ⚠️ Currently
  contains a real login PIN in plain text (user chose to include it) — keep the folder
  private; don't commit/share publicly.
- `icons/` — 16/32/48/128 PNG (red rounded "OS" badge).
- `VERSION.md` — changelog. `CLAUDE.md` — this file.

## Architecture
- **Isolated world** (`content.js`): builds the UI, reads DOM, dispatches synthetic
  events, reads/writes `chrome.storage.local`.
- **MAIN world** (`bridge.js`): reads ADF internals, writes readiness to a DOM attr the
  isolated script polls. Requires Chrome 111+ for `"world":"MAIN"`.
- **Service worker** (`background.js`): opens options page.

## Step model
A preset = `{ name, steps[], hotkey?, group? }`. `group` (optional string) puts the
preset in a named category. The stored array is kept **physically grouped** (same-group
presets contiguous, groups in first-seen order) so positional Alt+N and the panel match
the options-page order (`regroup()` in `options.js`). A step is one of:
- `"Text"` (plain string) — **click** the element with that visible text.
- `{ type:"click", text, delayMs? }` — click, with an optional pause after.
- `{ type:"input", label, value, delayMs? }` — type `value` into the field whose
  visible label matches.
- `{ type:"clear", label, delayMs? }` — delete the text in that field.
- `{ type:"key", label, delayMs? }` — press a key, label like `Escape`, `Enter`,
  `Ctrl+Enter`, `ArrowDown`.
`delayMs` is an extra pause AFTER the step, on top of the normal ready-wait.
`hotkey` (optional) = `{ctrl,alt,shift,meta,code,label}` custom shortcut.

## Shareable `.txt` format (import / export / default-presets.txt)
Notepad-editable. `#` lines are comments; the first is the preset name. One file may
hold one or many presets (blank line + new `#` starts the next).
```
# Preset Name
# group: Front Desk           <- optional: puts this preset in a group
Bookings                      <- click
@Report Name = pm ac          <- type "pm ac" into "Report Name"
clear: Reservation Type       <- clear that field
key: Escape                   <- press Escape
Download As... (delay 1s)     <- click, then wait 1s
```
`(delay 1s)` / `(delay 500ms)` suffix works on any line. An optional
`# group: <name>` line (right under the `# <name>` header) sets the preset's group;
files without it import exactly as before (`GROUP_RE` in `options.js` + `content.js`).

## OPERA / ADF gotchas (all learned the hard way — keep these!)
1. **No stable IDs / obfuscated classes.** ADF ids are positional (`...:fe8:...`) and
   classes are random (`x2am`, `xzu`). Match everything by **visible text**, never by
   id/class.
2. **Menus are async + hover flyouts.** After clicking a menu, submenu/flyout renders
   later. Replay must **wait for each item to appear** (`waitForText`, polling ~10s).
3. **Plain `.click()` is ignored.** ADF uses delegated handlers; dispatch a full
   pointer+mouse sequence (`fireClick`: pointerover→…→mousedown→mouseup→click).
4. **Load gating.** Use `bridge.js` readiness (`isPageFullyLoaded()`, `_serverBusy`,
   `_isUIBlocked()`, `_busyCounts`) → `waitForReady()` before each step. Do NOT rely on
   fixed sleeps for load timing.
5. **Fields have real `<label for>`.** Locate inputs by label text
   (`findInputByLabel`). Fill via the native value setter + `input`+`change` events.
6. **Never call `el.blur()` after setting a field** — ADF's partial refresh reverts the
   value. A natural blur from the next step is fine.
7. **Radios/checkboxes are hidden `<input>` behind styled labels** (e.g. Download As →
   Delimited Data). Clicking the label text does nothing. `fireClick` detects an option
   label and drives the underlying hidden input (`findAssociatedToggle`/`selectToggle`).
8. **Popup vs. background field collision.** The same label can exist in a modal popup
   AND on the page behind it. `findInputByLabel` ranks candidates by `frontScore`:
   inside a dialog/popup + a hit-test (background field is covered by the modal glass
   pane so it loses) + later-in-DOM tiebreak.
9. **Report export flow** (Manage Reports): select the report row → "Download As..." →
   pick a **radio** (Delimited Data) → "Download". The popup radios need gotcha #7, and
   often a `(delay 1s)` after "Download As..." (gotcha for controls that report ready
   before they're interactive).

## Keyboard shortcuts
- Default: **Alt+1…Alt+9** by the preset's position in the list.
- Custom: click a preset's shortcut badge in options and press a combo (needs
  Alt/Ctrl/Shift/⌘). A custom shortcut replaces that preset's Alt+N; ↺ resets to default.
- `content.js onHotkey`: custom hotkeys win; else positional Alt+digit for presets
  without a custom one.

## Theme (dark / light)
- **Dark is the default.** Stored in `chrome.storage.local` under `oshort_theme`
  ("dark" | "light"), shared by both surfaces and synced live via `storage.onChanged`.
- Driven by CSS custom properties + a `data-theme` attribute: on `<html>` for the options
  page (`options.html` sets `data-theme="dark"` inline to avoid a flash; native controls
  follow via `color-scheme`), on `#oshort-root` for the floating panel (`styles.css` is
  tokenised with dark as the base). Toggle: header button on the options page + a sun/moon
  button in the panel header (`content.js applyTheme`/`setTheme`).

## Floating panel = command palette (content.js + styles.css)
- OS button (draggable) or **Ctrl/⌘+K** opens it. No search box or header row (removed in
  2.1.0/2.1.1; theme + settings buttons live in the footer): the panel itself is focused (`tabIndex=-1`); ↑/↓ + Enter run, Esc closes, outside click closes.
  Panel keydown/keyup/keypress call `stopPropagation` so OPERA never sees palette keys.
- `content.js` applies the same `regroup()` ordering as the options page (in memory), so
  the palette and positional Alt+N always match the options page.
- Run card (`showProgress`) shows name, step i/n, a description (never typed values) and a
  progress bar; `toast(msg, "ok"|"err")` for results. Root state classes: `oshort-open`,
  `oshort-recording`, `oshort-running`, `oshort-dragging`. All other classes are `os-*`
  and every rule is scoped under `#oshort-root` (with a reset) against host CSS.

## Recorder (in the floating panel)
"Record" captures, in order: clicks (by visible text), typed field values
(on `change`, matched by label), and **action keystrokes** (Esc/Enter/Tab/arrows/
F-keys/Ctrl-Alt-Meta combos via `keydown`). Plain typing is a Type step, not per-key.

## Storage & defaults
- Presets live in **`chrome.storage.local`** under key `oshort_presets` — NOT in the
  folder. Persists across reloads (same extension ID). Lost if removed / loaded from a
  different path (new ID) / different profile.
- **First-install seed:** if storage has no presets, `content.js` fetches
  `default-presets.txt` (via `web_accessible_resources`) and seeds it (falls back to a
  built-in single default). To ship presets to a new PC: Export all → replace
  `default-presets.txt` → copy folder → Load unpacked.
- Renaming/moving the folder changes the unpacked extension ID → storage resets → but
  it re-seeds from `default-presets.txt`. For a stable ID across renames, add a `"key"`
  to the manifest (not currently done).

## Options page details
- Sticky top bar (filter `/`, Import, Export all, New preset, theme). Group columns (max 4),
  each with a **+**. Preset cards are **collapsed by default** (name, masked step summary,
  key caps); click to expand. `expanded` / `textMode` Sets track open cards (re-mapped by
  name when storage changes from elsewhere).
- Step row = number/grip slot (number turns into the grip on hover) + colour-coded action
  select + fields + collapsible ⏱ delay + ✕. Enter in a step moves to the next / adds one.
  Per-preset: Duplicate, **Edit as text** (textarea, same syntax as .txt), Export, Delete.
- Drag and drop (presets and steps) drops **above or below** the target by cursor half;
  dropping on a column's empty space or heading moves a preset to the end of that group.
  Reorders animate with FLIP (`flipMove`). Don't re-render on `dragend` (it kills the
  animation); `dragend` only clears marker classes.
- Import (one or many presets per file) / Export (per preset) / Export all (one bundle).
- **Self-write guard:** the storage `onChanged` listener ignores the page's own writes
  (`lastSelfSave` window) — otherwise saving on every keystroke re-renders and drops
  focus after one character.

## Dev / testing notes
- **No Node** in this environment. Syntax-check JS with a Python bracket/regex-aware
  balance script; validate `manifest.json` with `python -c "json.load(...)"`.
- **Best UI test method (no OPERA needed):** copy `options.js`/`content.js`/`styles.css`
  into a scratch folder with a `stub.js` that fakes `chrome.storage.local` (get/set +
  onChanged) and `chrome.runtime`; make `options_test.html` (options.html with stub.js
  before options.js) and a fake host page loading `styles.css` + stub + `content.js`
  (give it hostile CSS to prove isolation). Serve it with `python -m http.server` via a
  temporary `.claude/launch.json` + the built-in browser's `preview_start` (plain `file://`
  pages run as static snapshots, so external scripts never execute). Drive it with JS:
  synthetic `DragEvent`s with a `new DataTransfer()` exercise the drag-and-drop handlers.
  Remove the temp launch.json afterwards.
- Live testing uses **Claude-in-Chrome** against the user's real OPERA login (URL:
  `https://mtca2.oraclehospitality.ap-singapore-1.ocs.oraclecloud.com/RUMENT/...`).
  The MCP tab group is separate and can drop between turns — re-navigate as needed.
  Validate logic by injecting the real functions into the page and asserting behavior.
- ⚠️ **Never actually post payments / submit irreversible financial actions** when
  testing (e.g. the Make Payment "Post Payments" button). Test field/popup logic on
  synthetic pages or stop before the irreversible click.

## There is a sibling extension (NOT merged)
`..\opera-refresh-clicker` — an auto-clicker that repeatedly clicks a target (e.g.
Refresh) on an unthrottled background timer (offscreen document + alarms). The user
considered blending it into OShort but decided to leave it separate.
