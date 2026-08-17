# Changelog

All notable changes to PF2e Victory Counter are documented here.
This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - Unreleased

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
