# Changelog

All notable changes to PF2e Victory Counter are documented here.
This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.1] - 2026-08-17

### Fixed

- **The module did not load at all.** A code-scanning autofix merged into `main`
  as part of 3.0.0 added `pointercancel` handling to the HUD resize grip but
  deleted the `});` that closed the `pointerdown` callback. The resulting brace
  imbalance moved `#bindResizeGrip` and `#bindSetInputs` outside the class body,
  making `this.#bindResizeGrip(el)` a reference to an undeclared private name —
  a **parse-time** `SyntaxError`, not a runtime one:

  ```
  Uncaught SyntaxError: Private field '#bindResizeGrip' must be declared in an enclosing class
  ```

  Because the error happened while the ES module was being parsed, nothing in
  the module ever ran: no settings, no scene control buttons, no HUD, no API.
  The brace is restored and the `pointercancel` listener kept, since handling a
  cancelled gesture is a genuine improvement — without it the move listener
  leaks and the width is never persisted.

  No saved data was affected at any point; the module simply never started.

### Changed

- **A broken interface can no longer take down the whole module.** `hooks.js`
  and `api.js` previously imported the two ApplicationV2 subclasses statically,
  which put every part of the module in one failure domain — an unparseable UI
  file stopped `registerHooks()` from running and the module vanished from the
  scene controls with nothing but a console error to work from. Both files now
  load the applications lazily through dynamic `import()`. Settings, state,
  migration, the Token control buttons and the data half of the API keep working
  when a UI module cannot be loaded, and the failure surfaces as an actionable
  notification naming the likely cause instead of silence.
- `module.js` wraps `registerHooks()` so a failure anywhere in the core import
  graph reports itself by name rather than disappearing.
- Verified compatibility raised to Foundry v14.366 (tested against PF2e 8.4.1).

### Notes for reviewers

The regression reached `main` because the autofix commits landed on the release
branch after review and were merged without the module being loaded again. The
new self-test asserts that every private method is declared inside the class
body and that `#bindResizeGrip`'s braces balance, so this specific breakage
cannot merge silently a second time.

## [3.0.0] - 2026-08-17

### Changed

- **Breaking:** a track now measures progress toward a **single target**.
  Failure counters, failure thresholds, failure buttons and the win/loss
  distinction are gone. A track is either *in progress* or *complete*, and it
  completes when `current >= target`.
- **Breaking:** the track schema moved from `successes` / `requiredSuccesses` /
  `failures` / `requiredFailures` / `trackFailures` to `current` / `target` /
  `type`. Saved data is migrated automatically — see *Migration* below.
- **Breaking API:** `addSuccess(id, delta)` is deprecated in favour of
  `increase(id, amount)` / `decrease(id, amount)` / `adjust(id, delta)`;
  `setCounts(id, s, f)` is deprecated in favour of `setProgress(id, value)`.
  Both shims still work and log a one-time console deprecation notice.
  `addFailure()` no longer does anything: it notifies the caller and returns
  `null`. Model a "bad" track as a separate negative track instead.
- Counter labels dropped the word "successes" everywhere a user can see it.
  `2 / 5 Successes` is now `2 / 5`, *Successes Required* is now **Target**, and
  *Add Success* is now **Increase progress by 1**. Screen-reader labels and
  tooltips keep the full sentence; the visible chrome stays terse.
- The default track name changed from "Victory Points" to "Progress Track".
- `--pvc-danger` was replaced by `--pvc-negative` (`#ef7f6e`, 5.81:1 against the
  card surface). Any personal CSS override of `--pvc-danger` needs renaming.

### Added

- **Track polarity.** Every track is **Positive** (the default) or **Negative**,
  stored per track. Negative tracks draw their progress numbers and their ring
  in red instead of white, for every user rather than just the GM. Colour is
  never the only signal: each track also carries an up/down arrow icon, the
  written word *Positive* / *Negative*, a tooltip, and a full screen-reader
  label ("Raise the Alarm, Negative track, 2 of 5").
- **Circular progress rings.** A world setting (*Show Progress Rings*, on by
  default) draws an SVG ring per track with `current / target` in the centre.
  The ring is empty at 0, fills as progress is made, closes and picks up a halo
  at completion, and is clamped to 100% when progress exceeds the target. Pure
  SVG plus CSS — no charting dependency. Turning the setting off restores the
  large figure and horizontal bar.
- **Allow Progress Beyond Target** world setting, off by default. While it is
  off, increasing a completed track is refused with a notification explaining
  how to change it, and a large increase is capped at the target rather than
  overshooting. Decreases are never blocked, so a mis-click stays reversible.
- **Counter Width** client setting plus a drag grip in the HUD's bottom-right
  corner, so each user sizes the HUD to their own screen.
- Versioned, idempotent data migration with a one-time verbatim backup of the
  pre-3.0 track array, and a migration summary logged in debug mode only.

### Fixed

- **Window resizing and reflow.** The HUD and the control panel now lay their
  track cards out with CSS Grid (`repeat(auto-fill, minmax(…, 1fr))`), so the
  column count follows the available width: one column when narrow, two or
  three when wide. Cards carry `min-width: 0` so long track names truncate
  instead of forcing the grid wider than its container.
- Opening a fourth track no longer forces a scrollbar on its own. Scrolling now
  starts only when the content genuinely reaches the available viewport height,
  and widening the window removes it again.
- The control panel is properly resizable in v14: it opens at 720×660, enforces
  a 380×320 minimum in both CSS and `setPosition()`, and refits itself against
  the viewport after tracks are added or removed — including pulling itself back
  on screen if a stale position left the resize handle out of reach.
- The HUD's resize grip is a sibling of the scrolling card grid rather than a
  child, so it stays reachable with any number of tracks open.
- All animation is suppressed under `prefers-reduced-motion: reduce`. Nothing in
  the interface depends on motion to be understood.

### Migration

Running 3.0 for the first time migrates the world's saved tracks:

| Before (schema 2) | After (schema 3) |
|---|---|
| `successes` | `current` |
| `requiredSuccesses` | `target` |
| *(none)* | `type: "positive"` |
| `failures`, `requiredFailures`, `trackFailures` | preserved under `legacy` |

- Tracks with no stored `type` become **Positive**.
- The migration is idempotent — running it again changes nothing.
- A verbatim copy of the pre-migration array is written once to a hidden
  `legacyBackup` world setting. No existing setting or track record is deleted.
- Malformed or partial records fall back to safe defaults instead of throwing.
- The failure *count* cannot be represented in the new model. It is preserved in
  the data but no longer displayed; recreate it as a Negative track if you were
  using it during an ongoing challenge.

## [2.0.0] - 2026-08-17

### Changed

- **Breaking:** replaced the single active challenge with a list of up to 10
  concurrent, independently named tracks (e.g. "Infiltration Points", "Guard
  Awareness", "Doomsday Device Activation"), each with its own successes,
  failures, thresholds, and win/loss resolution. Existing world data from the
  1.x single-challenge setting is not migrated and will be replaced by an
  empty track list on first load.
- The HUD now renders a stacked list of track cards (one per track the current
  user may see) instead of a single panel; the collapsed state shows one
  compact chip per track.
- The GM control panel now lists every track with inline configuration,
  progress steppers, reordering, per-track player-visibility, reset and end
  controls, plus an "Add Track" form. Undo restores the entire track list to
  its previous snapshot.
- The public API (`game.modules.get("pf2e-victory-counter").api`) is now
  track-aware: `create`, `configure(id, …)`, `addSuccess(id, …)`,
  `addFailure(id, …)`, `setCounts(id, …)`, `reset(id)`, `end(id)`,
  `toggleVisibility(id)`, and `move(id, direction)` replace the old
  single-challenge methods.
- Chat cards are posted per track change and reference that track's name.

## [1.0.1] - 2026-08-17

### Fixed

- The GM control panel failed to open, logging `Template part "main" must render
  a single HTML element.` The panel template resolved to two or three sibling
  root elements; an ApplicationV2 template part must resolve to exactly one.
  The body is now wrapped in a single container.

## [1.0.0] - 2026-08-17

### Added

- Victory Points HUD implementing variant **1a** of the Nocturne design:
  translucent surface, hairline border, grab-handle title bar, large figure over
  target, accent progress bar, outlined actions. GM-only affordances carry the
  accent; everything a player sees is plain.
- Two counters in one HUD — successes (accent, primary) and failures (neutral
  ramp, one step quieter) — each with its own bar, `-` / `+` and a "set" field.
- Collapsed state uses the design's compact bar (variant 1e): kicker, figure,
  thin progress bar, failure readout and an expand chevron.
- Footer log line showing the last change (`+1 Successes 21:14`) and the
  challenge status.
- Draggable HUD: grab the title bar to move it, double-click the bar to snap
  back to the configured anchor. Position is per-user and clamped to the viewport.
- Eye button in the title bar toggles player visibility without opening the panel.
- Success track with a configurable requirement (1-100).
- Optional failure track with its own threshold; reaching it ends the challenge in defeat.
- GM control panel (Token scene controls, sliders icon) to start, reconfigure,
  adjust, reset, undo and end a challenge.
- Per-user overlay preferences: screen anchor, scale, collapse, and local hide.
- Optional chat cards on every progress change, whispered to GMs while the
  challenge is hidden from players.
- Single-level undo for every state change.
- Public API at `game.modules.get("pf2e-victory-counter").api` for macros.
- Full English localization; no player-facing strings are hard-coded in JavaScript.

### Design notes

- Nocturne is a mono-accent system with no danger role. The accent is reserved
  for progress toward victory; the failure counter uses the neutral ramp so it
  reads as pressure without competing. `--pvc-danger` (`#c2705f`) is the single
  sanctioned extension and appears only in the "challenge lost" treatment.
- No web font is fetched. The HUD asks for Inter and falls back to Foundry's UI
  face, so worlds running offline never flash an unstyled counter.
- Icons are Phosphor (MIT), inlined as SVG on `currentColor`, per the design system.

### Notes

- Foundry VTT v14 only. Verified against 14.365.
- The module stores state exclusively in two world-scoped settings. It never
  creates, updates or deletes Actors, Items, Scenes, Journals or any other
  world document.
