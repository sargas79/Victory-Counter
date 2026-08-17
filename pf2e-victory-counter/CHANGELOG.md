# Changelog

All notable changes to PF2e Victory Counter are documented here.
This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
