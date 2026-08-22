# Changelog

All notable changes to Victory Counter are documented here.
This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **"Announce in Chat" is now a live toggle, not a start-time setting.** The
  flag used to be a checkbox set when adding a track and only re-applied along
  with the rest of a card's configuration via "Apply Changes". It is now its own
  button on every track card that flips announcements on or off immediately, at
  any point in the track's life, and the card shows the current state. The
  checkbox is gone from the "Add a Track" form — new tracks announce by default
  and the GM turns it off whenever they want. Applying other configuration
  changes no longer touches the flag. New API method `toggleAnnounce(id)`;
  `configure(id, {postToChat})` still works for macros.

## [2.0.0] - 2026-08-18

### Added

- **The collapsed HUD has a real header.** The compact stack used to lead with a
  bare 20px strip carrying only the "VP" abbreviation and the expand chevron,
  with no surface of its own; over busy scene art it read as floating controls
  rather than the head of a panel, and nothing marked it as the drag handle it
  already was. The bar now takes the same gradient, shadow and blur as the
  expanded chrome and carries the localized module title, a track count and grip
  dots. The abbreviation kicker is gone, redundant now that the full title shows.
- **Progress steppers on the collapsed chips.** Nudging a track no longer means
  expanding the HUD or opening the control panel mid-scene: on a GM's screen a
  left-click on a chip adds 1 and a right-click removes 1. Chips are GM-gated,
  so a player's chip is unchanged, and adjustments go through `adjustTrack`, so
  clamping, the overshoot rule and chat announcements all apply as usual.
  The chips are keyboard-reachable — `role="button"`, a tab stop, an accessible
  name stating what activation does, and a focus-visible outline; Enter, Space
  and Arrow Up add 1, Arrow Down and Minus remove 1.
- **Per-track "Announce in Chat" option.** Each track now carries its own
  `postToChat` flag, editable in the GM control panel when adding a track and on
  every existing track card. When it is off, progress changes to that track post
  no chat card while other tracks keep announcing. The world setting "Post
  Progress to Chat" still acts as the master switch. Tracks stored before this
  option existed default to on, so behaviour is unchanged until a GM opts out.

### Notes

- 2.0.0 is the first release after the rename in 1.0.5, and the major bump
  records that break: the module id changed, so Foundry treats it as a different
  module and an existing install must be re-pointed at `victory-counter/`.

## [1.0.5] - 2026-08-18

The module is no longer tied to Pathfinder 2e. Nothing about how it works has
changed — the counter never read system data in the first place — but it was
packaged, named and gated as a PF2e module, and it is now none of those things.

### Changed

- **Renamed to `victory-counter`.** The module id, folder and stylesheet drop
  their `pf2e-` prefix, and the title is now just *Victory Counter*. Foundry
  requires the install folder to match the module id, so an existing manual or
  symlinked install must be re-pointed at `victory-counter/`.
- **No game system is declared.** The `relationships.systems` entry requiring
  the PF2e system is gone, so Foundry now offers the module in every world
  rather than only in PF2e ones. That entry was the actual barrier; it was never
  a technical dependency.
- **No game system is detected.** The `setup` hook no longer compares
  `game.system.id` against `"pf2e"` or warns when it differs. There is nothing
  system-specific left for the check to protect, and warning about a supported
  configuration is worse than saying nothing.
- Documentation, the bootstrap failure notice and the debug-log prefix refer to
  the module by its new name.

### Added

- **One-time import from the old module id.** Foundry namespaces settings by
  module id, so the rename would otherwise present every existing world as
  empty. On the first `ready` after upgrading, the GM's client reads the tracks
  stored under `pf2e-victory-counter`, migrates them through the normal schema
  pass and saves them under the new id, reporting how many were carried over.

  The import is deliberately narrow:

  - GM only, and exactly once per world — the latch is recorded even when
    nothing is found, so no world pays for the lookup twice.
  - It never overwrites. A world that already has tracks under the new id keeps
    them and the import is skipped.
  - It never writes to or deletes the old namespace. The `pf2e-victory-counter`
    settings stay in the world database exactly as they were, so reinstalling
    that module recovers the original world unchanged.
  - The imported array is backed up verbatim before it is reshaped, alongside
    the existing pre-schema-3 backup.

  Per-user display preferences (anchor, width, scale, collapsed state) are not
  imported. They are cosmetic, per-client, and set again on first use.

## [1.0.4] - 2026-08-17

### Fixed

- **The module did not load at all.** A code-scanning autofix merged into `main`
  as part of 1.0.3 added `pointercancel` handling to the HUD resize grip but
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

## [1.0.3] - 2026-08-17

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
  pre-schema-3 track array, and a migration summary logged in debug mode only.

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

Running 1.0.3 for the first time migrates the world's saved tracks:

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

## [1.0.2] - 2026-08-17

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
