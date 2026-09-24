# OPERA Shortcut (OShort) — Changelog

Version lives in `manifest.json` (`"version"`). Every change bumps it and adds an
entry here. Semver: **major** = breaking, **minor** = new feature, **patch** = fix.

After bumping, reload at `chrome://extensions` (↻) — a manifest change needs a full
reload, not just a page refresh.

---

## 2.0.0 — 2026-09-23
**Redesign: dense "pro tool" UI and UX for both the floating panel and the options page.**
Stored presets, groups, shortcuts and theme are fully compatible, so nothing needs
migrating. The major version marks the changed workflows.

Floating panel → **command palette**
- Search box on top, focused when opened; type to filter; **↑/↓** move, **Enter** runs,
  **Esc** clears the search then closes. **Ctrl+K** (⌘K) opens/closes it from anywhere in
  OPERA; clicking outside closes it. Typing in it never leaks keystrokes to OPERA.
- Group labels in small caps with counts, shortcuts shown as key caps (custom ones tinted),
  delete on hover now asks for confirmation.
- New **run card** while a preset plays: name, step i/n, what it's doing (typed values are
  never shown), a progress bar and the Esc Esc hint. The OS button shows a spinning ring
  while running and a pulse while recording.
- Recorder redesigned: colour-coded step tags (Click / Type / Clear / Key), live step count,
  name + Save row (Enter saves).
- All panel styles are scoped under `#oshort-root` with a reset, so OPERA's CSS can't leak in.
- The panel now uses the same stable group ordering as the options page, so a stored list
  with interleaved groups no longer shows a group twice and Alt+N always matches.

Options page → **compact editor**
- Sticky top bar: filter box (**/** focuses it), Import, Export all, **New preset**, theme.
- Preset cards are **collapsed by default**: one line with name, a step summary (typed
  values masked) and key caps; click to expand the full editor.
- Group columns (max 4) now have a **+** to create a preset in that group; rename a group by
  editing its heading.
- Drag and drop now drops **above or below** the target depending on cursor position, for
  both presets and steps; dropping into a column's empty space moves the preset to the end
  of that group. Fixed: a stray re-render on drag end could cut the slide animation short.
- Step rows are denser: the number turns into the drag handle on hover, the delay collapses
  to a ⏱ icon until set, and action labels are colour-coded. **Enter** in a step jumps to the
  next step (or adds one after the last).
- New per-preset actions: **Duplicate**, **Edit as text** (same syntax as the .txt files),
  Export, Delete. The old "Add a preset" text form is replaced by New preset + Edit as text.
- Syntax help moved into a collapsible "Step syntax & tips" section.
- Files: `options.html`, `options.js`, `content.js`, `styles.css`.

## 1.20.0 — 2026-09-22
**Polish: smooth drag-and-drop reorder animations.**
- Reordering now **animates** — items slide into their new positions instead of snapping.
  Applies to both step rows and preset cards (cards even glide between group columns).
- Uses a FLIP animation (`flipMove` in `options.js`): measure First positions → mutate →
  invert each element to its old spot → transition to zero (.22s ease). Honours
  `prefers-reduced-motion` (skips the animation).
- Drag cues polished too: the dragged row/card fades + lifts, and the drop line / target
  highlight transitions in smoothly (`options.html`).
- Files: `options.js`, `options.html`.

## 1.19.0 — 2026-09-22
**Feature: drag to reorder steps (replaces the ↑/↓ buttons).**
- Each step row now has a **⋮⋮ drag handle**; drag it and drop between steps to reorder.
  The old Move up / Move down buttons are gone. Delete (✕) stays.
- Only the grip starts a drag, so the step's fields remain editable; a drop line shows
  where the step will land. Same mechanism as the preset-level drag.
- Bonus: removing the two buttons frees space, so rows fit even more comfortably in the
  narrow group columns.
- Files: `options.js` (step drag/drop in `buildStepEditor`), `options.html` (grip styles).

## 1.18.1 — 2026-09-22
**Fix: step rows wrapping to a second line in the narrow group columns.**
- Since presets became side-by-side columns (1.17.1), each column is narrower and a
  step's move/delete buttons (↑ ↓ ✕) spilled onto a second line.
- Two changes: (1) the step editor now spans the **full card width** — it sits below the
  meta row instead of being squeezed between the shortcut badge and the Export/Delete
  column; (2) step rows are `flex-wrap: nowrap` with a shrinkable text field and compact
  fixed controls, so the field narrows instead of the buttons wrapping. Verified single-
  line at 4 columns / 1300px.
- Files: `options.html` (CSS), `options.js` (editor moved to full-width card slot).

## 1.18.0 — 2026-09-22
**Feature: dark mode (default), with a light/dark toggle.**
- Both the options page and the floating panel/recorder/toast now support a **dark
  theme, which is the default**. Users can switch to light and back.
- **Toggle points:** a *☀ Light mode / ☾ Dark mode* button in the options-page header,
  and a sun/moon button in the floating panel's header. The choice is stored in
  `chrome.storage.local` under `oshort_theme` ("dark" | "light") and is **shared** —
  toggling in one place updates the other live (via `storage.onChanged`).
- Implemented with CSS custom properties + a `data-theme` attribute (on `<html>` for the
  options page, on `#oshort-root` for the panel). `options.html` ships `data-theme="dark"`
  inline so there's no light flash before scripts run; native form controls follow via
  `color-scheme`.
- Files: `styles.css` (tokenised, dark default), `content.js` (theme state, panel toggle,
  load/sync), `options.html` (themed tokens + toggle button), `options.js` (theme
  load/apply/toggle/sync).

## 1.17.1 — 2026-09-22
**UI: options page is full width, groups shown side by side.**
- The options page no longer caps at 760px — it uses the full window width.
- Groups now render as **columns side by side** (a CSS grid), **max 4 across**; a 5th+
  group wraps to the next row. Each column stacks its own presets vertically under the
  group heading. Ungrouped presets form their own column.
- `options.js render()` builds a `.groupgrid` with one `.groupcol` per group;
  `options.html` sets `.wrap` to full width and adds the grid/column styles.
- Files: `options.html`, `options.js`.

## 1.17.0 — 2026-09-22
**Feature: group presets into named categories.**
- Each preset now has an optional **Group**. On the options page every preset card
  has a *Group* field (with an autocomplete of existing groups), presets are shown in
  sections under editable group headings, and **editing a heading renames the whole
  group**. Dragging a preset onto another now also makes it **join that preset's group**.
  The "Add a preset" form has a Group field too.
- The stored array is kept physically grouped (same-group presets contiguous, groups
  in first-seen order) so the positional **Alt+N** shortcuts and the floating panel stay
  in the same order the options page shows. The floating panel now shows subtle group
  headers as well.
- Groups persist through **Export / Import** and the bundled **default-presets.txt** via a
  new optional `# group: <name>` directive line (right under the `# <name>` header).
  Old files with no such line still import exactly as before.
- Backward compatible: existing presets simply have no group and render as a flat list.
- Files: `options.html`, `options.js`, `content.js`, `styles.css`.

## 1.16.0 — 2026-09-22
**Feature: Shift can now be used as a custom-shortcut modifier.**
- The shortcut recorder previously required Alt, Ctrl or ⌘; Shift alone was rejected.
  Now Shift also qualifies, so combos like `Shift+F2` or `Alt+Shift+R` can be set.
- `options.js buildHotkey`: accept `shiftKey` as a real modifier.
- `content.js onHotkey`: the "need a real modifier" gate now also lets Shift-only
  combos through to the matcher (`hkMatches` already compared shift correctly).
- Updated the hint text in `options.html` and the badge tooltip to list Shift.
- ⚠️ Note: a plain `Shift+<letter/number>` shortcut will fire (and swallow the key)
  even while typing in a field — prefer pairing Shift with Alt/Ctrl or using
  Shift+Function keys to avoid clashing with normal typing.
- Files: `content.js`, `options.js`, `options.html`.

## 1.15.2 — 2026-09-16
**UI: preset list even more compact.**
- Further reduced row height: `.oshort-run` padding 4px→2px with tighter line-height
  (1.1) and font 13px→12.5px; `.oshort-del` padding 4px→2px; badge (`.oshort-hk`)
  padding 1px 5px→0 4px and font 10px→9px, name gap 8px→6px.
- Files: `styles.css`.

## 1.15.1 — 2026-09-16
**UI: more compact preset list in the floating panel.**
- Reduced the vertical padding on each preset row (`.oshort-run` 7px→4px,
  `.oshort-del` 8px→4px) so the list is tighter and shows more presets at a glance.
- Files: `styles.css`.

## 1.15.0 — 2026-09-16
**Feature: double-press Esc to cancel a running preset.**
- A preset run had no cancel — a missing/renamed step would block up to 10s per step
  with no way out. Now **pressing Esc twice within 600ms** aborts the current run
  immediately, including mid-wait (the 10s step waits and any `(delay Xs)` pause end
  right away). A "Stopped ✕" toast confirms it, and the first step's toast shows the
  `Esc Esc = stop` hint.
- Implementation: each `runPreset` claims a `currentRun` token; the loop and all wait
  helpers (`waitForReady`/`waitForText`/`waitForInput` + a new abortable `waitMs`) bail
  the instant the token is superseded. The Esc listener only reacts to real user key
  presses (`e.isTrusted`), so a preset's own synthetic Escape key-steps can't self-abort.
- Files: `content.js`.

## 1.14.3 — 2026-09-15
**Fix: step rows wrapping to two lines when a custom shortcut is set.**
- The custom-shortcut reset (↺) button sat next to the badge, widening that column and
  pushing the step row's × onto a second line. The reset now stacks under the badge
  (column width unchanged), and step fields shrink a bit more, so rows stay on one line.
- Files: `options.html` (`.keywrap` column layout, smaller `.stepfields` min-width).

## 1.14.2 — 2026-09-15
**Fix: options fields deselecting after one character.**
- Editing a step field (or any per-keystroke input) saved on every keystroke, which
  fired the storage listener and re-rendered the whole list, killing focus after one
  character. The listener now ignores the page's own writes, so typing is smooth.
- Files: `options.js` (`lastSelfSave` guard on the storage change listener).

## 1.14.1 — 2026-09-13
**Fix: type/clear into the popup, not the field behind it.**
- When the same field label exists in a popup AND on the page behind it (e.g. the
  Make Payment dialog's Supplement/Reference vs. the search screen's), field lookup
  now picks the front-most one: it scores candidates by being inside a dialog/popup
  and by a hit-test (the background field is covered by the modal glass pane, so it
  loses), with a later-in-DOM tiebreak. Fixes values landing on the background field.
- Affects both Type and Clear steps (shared `findInputByLabel`/`waitForInput`).
- Files: `content.js` (`frontScore`, ranked `findInputByLabel`).

## 1.14.0 — 2026-09-13
**Key-press steps (Esc / Enter / Tab / arrows / combos).**
- The recorder now captures action keystrokes as steps — Escape, Enter, Tab, arrows,
  Page/Home/End/Delete/Insert, F-keys, and any Ctrl/Alt/Meta combo. Plain typing is
  still captured as a Type step, so text isn't double-recorded.
- Replay dispatches the key (keydown/keyup, plus keypress for Enter/Space) on the
  focused element with legacy keyCode/which set, so ADF handlers respond (e.g. Esc to
  close a popup, Enter to submit).
- Editor: new "Press key" action — click and press the key to set it. Text syntax is
  `key: Escape` (or `key: Ctrl+Enter`); `(delay …)` still allowed.
- Files: `content.js` (key model, `pressKey`, parse, recorder `onKeyCapture`),
  `options.js` (norm/denorm, editor option + recorder, text parse/serialize),
  `options.html` (styling + help).

## 1.13.0 — 2026-09-13
**Editable per-preset shortcuts.**
- Click a preset's shortcut badge in the options page and press a combo (needs
  Alt/Ctrl/⌘, e.g. Alt+Q, Ctrl+Shift+R) to set a custom shortcut; **↺** resets it to
  the default Alt+position. Duplicate combos are cleared from other presets.
- A custom shortcut replaces that preset's Alt+N; presets left as default still use
  Alt+1..9 by position. The floating panel badge shows whichever is active.
- Files: `content.js` (`hkMatches`, custom-first `onHotkey`, badge label),
  `options.js` (`buildHotkey`/`recordHotkey`, editable badge + reset, sync guard),
  `options.html` (badge styling + help text).

## 1.12.1 — 2026-09-12
**Populated default-presets.txt with the current preset set.**
- Bundled the 5 working presets (PIN, Manage Reservation, AR Account, Create PM,
  PM Report) as first-install defaults, from the user's Export-all output.
- Note: default-presets.txt is a plain-text file in the folder and includes any values
  the presets contain — keep the folder private when sharing.
- Files: `default-presets.txt`.

## 1.12.0 — 2026-09-12
**Export all + bundled default presets (for new installs).**
- **Export all** button (options toolbar) downloads every preset in one
  `oshort-presets.txt` bundle — a one-click backup.
- **Import** now accepts a file with one OR many presets (each `# Name` starts one),
  so a bundle re-imports cleanly; duplicate names auto-suffix.
- **First-install defaults:** on a profile with no saved presets, the extension seeds
  from a bundled `default-presets.txt` in the folder (falls back to the built-in
  single default if absent). Ship your own presets on a new PC by replacing that file
  with your Export-all output. Exposed via `web_accessible_resources`.
- Files: `content.js` (`parseBundle`, `loadBundledDefaults`, seed on init),
  `options.js` (`parseBundle`/`bundleText`, Export-all, multi-preset import),
  `options.html` (Export-all button), `manifest.json` (web_accessible_resources),
  `default-presets.txt` (new, seeded with the built-in default).

## 1.11.2 — 2026-09-12
**Tighter floating panel rows.**
- Reduced preset row padding (11px → 7px) so the rows sit closer together — the gap
  looked too big after the step line was removed. Rows are now ~28px each.
- Files: `styles.css` (`.oshort-run` padding).

## 1.11.1 — 2026-09-12
**Cleaner floating panel — dropped the per-step line.**
- Preset rows in the floating panel now show just the name + Alt badge; the
  `Bookings › Reservations › …` step summary was removed (it's still in the options
  page). Less clutter in the small panel.
- Files: `content.js` (renderList), `styles.css` (removed `.oshort-steps`).

## 1.11.0 — 2026-09-12
**"Upload & run" button on the floating panel.**
- The floating panel footer now has a solid **↑ Upload & run (.txt)** button: pick a
  shared preset file and it runs immediately, no need to open the options page.
- The uploaded preset is run one-off, not saved (use the options-page Import to keep
  it). Reuses the same `.txt` format/parser.
- Files: `content.js` (`splitDelay`/`parseSteps`/`parsePresetFile`, hidden file input,
  `onUploadRun`, panel button), `styles.css` (footer layout + Upload button).

## 1.10.0 — 2026-09-12
**Share presets: Export / Import as .txt (one preset per file).**
- Each preset has an **Export** button that downloads a Notepad-editable `.txt`:
  a `# Name` line followed by the step lines (the same editor syntax). `#` lines are
  comments; the first is the preset name.
- An **Import preset (.txt)** button (top toolbar) reads one or more files, each
  becoming a preset; duplicate names are auto-suffixed `(2)`, nothing is overwritten.
- Nothing runs on import — it just adds the preset; the recipient runs it deliberately.
- Portability is text-based: a shared preset works elsewhere if the OPERA menu
  labels/language match.
- Files: `options.js` (`presetToText`/`parsePresetFile`/`downloadText`/`uniqueName`,
  per-preset Export, Import wiring), `options.html` (toolbar + Export/Import styling).

## 1.9.0 — 2026-09-11
**New "Clear field" step (delete a field's text).**
- Adds a third step action alongside Click and Type: **Clear field**, which deletes
  the text in the field with the given label. Use it before a Type step to replace a
  value (e.g. Alt+4: Clear "Reservation Type", then Type `NGTD`).
- Clears thoroughly (select-all + delete, then force empty + fire change) so ADF
  autocomplete/LOV fields don't keep the old value.
- Editor: the Type/Click dropdown now includes "Clear field" with a single label box.
  Text syntax (Add box) is `clear: Field label`, `(delay …)` still allowed.
- Files: `content.js` (`clearField`, `isClearStep`, runPreset branch, panel icon),
  `options.js` (norm/denorm, editor option, text parse/serialize), `options.html`.

## 1.8.0 — 2026-09-11
**Structured step editor in the options page.**
- Replaced the raw steps text box with an editable row per step: a **Click / Type**
  selector, the text (or field label + value), a **⏱ seconds** wait box, and
  move-up / move-down / delete buttons, plus **+ Add step**. Edits save live.
- Only the drag grip now starts a preset drag, so the step inputs stay fully editable.
- The compact `@field = value` / `(delay 1s)` syntax still backs the storage format,
  so existing presets load into the editor unchanged; delay-less clicks stay plain
  strings. The bottom "Add a preset" box still accepts the text syntax.
- Files: `options.js` (`normStep`/`denormSteps`/`buildStepEditor`, grip-only drag),
  `options.html` (editor CSS). Supersedes 1.7.0's read-only summary.

## 1.7.0 — 2026-09-11
**Readable step summary in the options page.**
- Under each preset's editable steps box, a numbered plain-English summary now spells
  out each action, e.g. `Click "Bookings"`, `Type "pm ac" into Report Name`,
  `Click "Download As..." — then wait 1s`. Updates live as you edit.
- The compact editing syntax is unchanged; this is a read-only description on top.
- Files: `options.js` (`describeStep`/`renderDesc` + card summary), `options.html` (CSS).

## 1.6.0 — 2026-09-11
**Per-step delay directive.**
- You can append `(delay 1s)` or `(delay 500ms)` to the end of any step line. After
  that step, replay pauses that long **on top of** the normal page-ready wait.
- Works on click steps and `@field` steps. Plain number defaults to seconds.
- Fixes controls that report "ready" before they are actually interactive (e.g. the
  Download As popup breaking when Delimited Data was clicked too fast).
- Files: `content.js` (step model gains `delayMs`, applied after each step),
  `options.js` (parse/serialize the `(delay …)` suffix), `options.html` (help text).

## 1.5.1 — 2026-09-11
**Fix: ADF radio / checkbox options not selected.**
- OPERA renders radios/checkboxes (e.g. Download As → HTML / RTF / XML / Delimited /
  **Delimited Data**) as a hidden `<input>` behind a styled label, so clicking the
  visible label selected nothing and left Download disabled.
- `fireClick` now detects when the clicked element is an option label and drives the
  underlying radio/checkbox instead (select radio / toggle checkbox + fire `change`).
- Existing presets keep working — no re-recording needed.
- Files: `content.js` (`findAssociatedToggle`, `selectToggle`).

## 1.5.0 — 2026-09-11
**Load-aware waiting (no more fixed delays).**
- New `bridge.js` runs in OPERA's own page context (`"world":"MAIN"`) and publishes
  ADF's real busy/loaded state to `data-oshort-ready` on `<html>`.
- Replay now waits for OPERA to finish loading before each step instead of guessing
  with fixed sleeps — adapts to actual load time, fast or slow.
- Falls back safely (treated as ready) if the bridge can't load. Needs Chrome 111+.
- Files: `bridge.js` (new), `manifest.json` (2nd content script, MAIN world),
  `content.js` (`waitForReady`, gate in `runPreset`; element timeouts 6s → 10s).

## 1.4.0 — 2026-09-11
**Record & replay typed input.**
- The recorder now captures what you type into fields, not just clicks. A typed step
  matches the field by its visible label; on replay it fills the value.
- Discovered/handled an ADF quirk: never call `blur()` (it reverts the field); a
  natural blur from the next step is fine.
- Editor syntax: `@Field label = value` (e.g. `@Confirmation Number = 12345`).
- Files: `content.js` (input capture + replay), `options.js`/`options.html` (syntax).

## 1.3.0 — 2026-09-11
**Positional Alt+1 … Alt+9 shortcuts.**
- Replaced per-preset custom hotkeys with a simpler model: each preset's shortcut is
  Alt + its position in the list (1st = Alt+1, …). Reordering changes the number.
- Only the first 9 presets get a shortcut.
- Files: `content.js` (keydown handler + list badge), `options.js`/`options.html`.

## 1.2.0 — 2026-09-11
**Options page + keyboard shortcuts.**
- New options page: rename, drag-to-reorder, edit steps, delete, add presets.
- Gear button on the floating panel opens it; background service worker added.
- (Initial shortcut model was per-preset custom combos; replaced in 1.3.0.)
- Files: `options.html`/`options.js` (new), `background.js` (new), `manifest.json`
  (`options_ui`, `background`, `action`), `content.js`, `styles.css`.

## 1.1.0 — 2026-09-11
**Icons.**
- Added PNG icons (16/32/48/128) — a red rounded badge with "OS" — for the toolbar
  and the extensions page.
- Files: `icons/*.png` (new), `manifest.json` (`icons`, `action.default_icon`).

## 1.0.0 — 2026-09-11
**Initial release.**
- Floating **OS** button (draggable) that expands to a list of presets.
- Built-in **Manage Reservation** preset (Bookings → Reservations → Manage Reservation).
- In-page recorder: click through a flow and save it as a preset.
- Replay matches menu items by **visible text** (OPERA/ADF has no stable IDs), waits
  for each to appear, and fires a full pointer+mouse sequence so ADF responds.
- Presets stored in `chrome.storage.local`.
- Files: `manifest.json`, `content.js`, `styles.css`.
