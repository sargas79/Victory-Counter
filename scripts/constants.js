/**
 * Shared constants and small utilities for the Victory Counter module.
 * @module victory-counter/constants
 */

export const MODULE_ID = "victory-counter";

/**
 * The id this module shipped under up to and including 3.x, when it was
 * packaged as a Pathfinder 2e-only module.
 *
 * Foundry namespaces settings by module id, so a world that used the old build
 * still holds its tracks under this id. It is read exactly once, by the
 * one-time import in `migration.js`, and never written to.
 */
export const LEGACY_MODULE_ID = "pf2e-victory-counter";

/** Setting keys, namespaced under the module. */
export const SETTINGS = Object.freeze({
  /** World scope. The list of active tracks (plain objects). */
  TRACKS: "tracks",
  /** World scope. One-level undo snapshot of the previous tracks array. */
  UNDO: "undoBuffer",
  /** World scope. Schema version of the data currently in {@link SETTINGS.TRACKS}. */
  SCHEMA: "schemaVersion",
  /** World scope. Verbatim copy of the pre-migration track array, written once. */
  LEGACY_BACKUP: "legacyBackup",
  /**
   * World scope. Whether the one-time import from the old `pf2e-victory-counter`
   * module id has already run in this world. Set even when nothing was found,
   * so the lookup happens once rather than on every load.
   */
  IMPORTED_LEGACY_MODULE: "importedLegacyModule",
  /** Client scope. Per-user local dismissal of the overlay. */
  OVERLAY_HIDDEN: "overlayHidden",
  /** Client scope. Per-user collapsed/expanded overlay state. */
  OVERLAY_COLLAPSED: "overlayCollapsed",
  /** Client scope. Screen anchor for the overlay. */
  OVERLAY_POSITION: "overlayPosition",
  /** Client scope. Free-drag offset `{left, top}` which overrides the anchor. */
  OVERLAY_OFFSET: "overlayOffset",
  /** Client scope. Overlay scale multiplier. */
  OVERLAY_SCALE: "overlayScale",
  /** Client scope. Overlay surface width in pixels, set by the resize grip. */
  OVERLAY_WIDTH: "overlayWidth",
  /** World scope. Draw a circular progress ring on every track. */
  SHOW_RINGS: "showProgressRings",
  /** World scope. Allow the current value to be pushed past the target. */
  ALLOW_OVERSHOOT: "allowOvershoot",
  /** World scope. Post a chat card whenever a track's state changes. */
  POST_CHAT: "postChatUpdates",
  /** World scope. Verbose console logging. */
  DEBUG: "debug"
});

/**
 * Current persisted schema version for a track object.
 *
 * - 1/2: `successes` / `failures` with `requiredSuccesses` / `requiredFailures`.
 * - 3:   single `current` / `target` pair plus a `type` polarity.
 * - 4:   `mode`, plus the threshold fields (`start`, `min`, `max`, `thresholds`,
 *        `band`). Purely additive: every v3 field keeps its meaning, and a v3
 *        record becomes a v4 progress track without any value being rewritten.
 * - 5:   `display` and `runes`. Additive in the same way, and for a stronger
 *        reason: they decide only how a track is *drawn*, so a v4 record
 *        becomes a v5 record that renders exactly as it did before.
 */
export const SCHEMA_VERSION = 5;

/** Resolution states a track can be in. */
export const STATUS = Object.freeze({
  RUNNING: "running",
  COMPLETE: "complete"
});

/**
 * How a track measures itself. Stored per track; progress is the default and is
 * what every pre-4 track migrates to.
 *
 * - `progress`:  counts up from zero toward a target and completes there.
 * - `threshold`: starts at a GM-set value, moves up *and* down (below zero if
 *                the GM allows it), and never completes. Meaning comes from the
 *                band it currently sits in rather than from a finish line.
 */
export const TRACK_MODES = Object.freeze({
  PROGRESS: "progress",
  THRESHOLD: "threshold"
});

/** Localization keys for the mode choices, keyed by stored value. */
export const TRACK_MODE_LABELS = Object.freeze({
  [TRACK_MODES.PROGRESS]: "PVC.Mode.Progress",
  [TRACK_MODES.THRESHOLD]: "PVC.Mode.Threshold"
});

/**
 * How a track is *drawn*. Stored per track, and deliberately independent of
 * {@link TRACK_MODES}, which decides how a track is *counted*.
 *
 * Keeping the two apart is what lets the rune circle sit on top of either mode
 * without either of them learning about it: a progress track seats one rune per
 * point of its target, a threshold track seats one per rung of its ladder, and
 * both still count exactly as they always did.
 *
 * - `standard`: the readout the module has always drawn — a bar or a ring for a
 *               progress track, the ladder rail for a threshold one.
 * - `circle`:   a ring of seats with runes that start adrift outside it and
 *               move into place as the track fills.
 */
export const TRACK_DISPLAYS = Object.freeze({
  STANDARD: "standard",
  CIRCLE: "circle"
});

/** Localization keys for the display choices, keyed by stored value. */
export const TRACK_DISPLAY_LABELS = Object.freeze({
  [TRACK_DISPLAYS.STANDARD]: "PVC.Display.Standard",
  [TRACK_DISPLAYS.CIRCLE]: "PVC.Display.Circle"
});

/**
 * How a threshold band reads relative to the track's starting value. Derived,
 * never stored: a band below the start is pressure, above it is progress, and
 * the band containing the start is the status quo.
 */
export const BAND_TONES = Object.freeze({
  NEGATIVE: "negative",
  NEUTRAL: "neutral",
  POSITIVE: "positive"
});

/** Track polarity. Stored per track; positive is the default. */
export const TRACK_TYPES = Object.freeze({
  POSITIVE: "positive",
  NEGATIVE: "negative"
});

/** Localization keys for the polarity choices, keyed by stored value. */
export const TRACK_TYPE_LABELS = Object.freeze({
  [TRACK_TYPES.POSITIVE]: "PVC.Type.Positive",
  [TRACK_TYPES.NEGATIVE]: "PVC.Type.Negative"
});

/** Valid overlay anchors. Keys must match the CSS modifier classes. */
export const OVERLAY_POSITIONS = Object.freeze({
  "top-center": "PVC.Settings.OverlayPosition.TopCenter",
  "top-left": "PVC.Settings.OverlayPosition.TopLeft",
  "top-right": "PVC.Settings.OverlayPosition.TopRight",
  "bottom-center": "PVC.Settings.OverlayPosition.BottomCenter"
});

/** Hard bounds. Counts and list size are clamped to these to keep the UI and data sane. */
export const LIMITS = Object.freeze({
  MIN_TARGET: 1,
  MAX_TARGET: 100,
  MAX_COUNT: 999,
  MAX_TITLE_LENGTH: 80,
  MAX_TRACKS: 10,
  /**
   * Hard bounds for a threshold track's value and for its own min/max. Unlike
   * MAX_COUNT these are symmetric: a threshold track may sit below zero.
   */
  MIN_VALUE: -999,
  MAX_VALUE: 999,
  /** Rungs on one track's ladder. Beyond this the ladder stops being readable. */
  MAX_THRESHOLDS: 12,
  MAX_THRESHOLD_LABEL: 60,
  MAX_THRESHOLD_DESCRIPTION: 240,
  /** Overlay surface width, driven by the resize grip. */
  MIN_OVERLAY_WIDTH: 264,
  MAX_OVERLAY_WIDTH: 1200,
  /** Control panel window, enforced in CSS and in `setPosition`. */
  MIN_PANEL_WIDTH: 380,
  MIN_PANEL_HEIGHT: 320,
  /**
   * Threshold editor window, enforced the same way. Wider than the panel's
   * floor because a rung is a row of four fields that has to stay readable, and
   * shorter because the editor is a list: it scrolls rather than reflowing, so
   * it stays usable at a height that would leave the panel unusable.
   */
  MIN_EDITOR_WIDTH: 420,
  MIN_EDITOR_HEIGHT: 260,
  /**
   * Rune editor window. Narrower than the ladder editor because a rune row is
   * two short fields rather than four, and no taller for the same reason the
   * ladder editor is short: it is a list, and it scrolls.
   */
  MIN_RUNE_EDITOR_WIDTH: 360,
  MIN_RUNE_EDITOR_HEIGHT: 260,
  /**
   * A rune override is a glyph, not a word. Two characters is enough for a
   * surrogate pair — most of the symbols a GM is likely to paste in live above
   * the basic plane — and short enough that the seat stays a seat.
   */
  MAX_RUNE_GLYPH: 2
});

/**
 * Geometry of the SVG progress ring. The circle is drawn in a 100x100 viewBox so
 * the ring scales purely through CSS; only the dash offset is computed in JS.
 */
export const RING = Object.freeze({
  RADIUS: 42,
  CIRCUMFERENCE: Number((2 * Math.PI * 42).toFixed(3))
});

/**
 * Geometry of the rune circle, in percentages of the plate it is drawn on, so
 * the whole figure scales with the card and the template never does arithmetic.
 *
 * `MAX_POSITIONS` is 24 because {@link RUNE_GLYPHS} has 24 staves and because a
 * circle stops being countable at a glance well before that. A track that would
 * need more seats than this falls back to its standard readout rather than
 * cramming them in — see `runeSeatCount` in `rune-view.js`.
 */
export const CIRCLE = Object.freeze({
  /** The ring the runes settle onto. */
  SEAT_RADIUS: 34,
  /** Where an unearned rune hangs, before the per-seat scatter below. */
  ADRIFT_RADIUS: 44,
  MAX_POSITIONS: 24
});

/**
 * The default glyph set: the 24 staves of the Elder Futhark, in their
 * traditional order.
 *
 * Auto-assigned by seat index, so a rune circle is legible the moment it is
 * switched on and the GM only opens the rune editor if they want something
 * else. Drawn as text rather than as paths because 24 hand-authored SVG glyphs
 * would be 24 things to get subtly wrong; the CSS names an explicit font stack
 * so a host without Runic coverage shows a visible box rather than nothing, and
 * any seat can be overridden regardless.
 */
export const RUNE_GLYPHS = Object.freeze([
  "ᚠ", "ᚢ", "ᚦ", "ᚨ", "ᚱ", "ᚲ", "ᚷ", "ᚹ",
  "ᚺ", "ᚾ", "ᛁ", "ᛃ", "ᛇ", "ᛈ", "ᛉ", "ᛊ",
  "ᛏ", "ᛒ", "ᛖ", "ᛗ", "ᛚ", "ᛜ", "ᛞ", "ᛟ"
]);

/**
 * The immutable default shape of a single track. Any stored value is merged
 * onto a clone of this object with `insertKeys: false`, so unknown keys are
 * discarded and missing keys are backfilled.
 * @type {Readonly<object>}
 */
export const DEFAULT_TRACK = Object.freeze({
  schema: SCHEMA_VERSION,
  id: "",
  active: false,
  title: "",
  /** One of {@link TRACK_MODES}. Decides how `current` is bounded and read. */
  mode: TRACK_MODES.PROGRESS,
  /**
   * One of {@link TRACK_DISPLAYS}. Decides how the track is drawn and nothing
   * else — no value, bound or status anywhere in the module reads it.
   */
  display: TRACK_DISPLAYS.STANDARD,
  /**
   * Rune circle: per-seat glyph and label overrides, `{key, glyph, label}`.
   * Empty means every seat uses its default stave from {@link RUNE_GLYPHS}.
   *
   * `key` is the seat's identity: the rung id on a threshold track, the ordinal
   * index as a string on a progress one. Keying threshold seats by rung rather
   * than by position is what stops every override below an inserted rung from
   * silently sliding onto the wrong band.
   *
   * Kept while the track is drawn as standard, for the same reason the ladder
   * is kept in progress mode: switching display is a display decision, and
   * discarding what the GM wrote would be worse than carrying a few bytes.
   */
  runes: [],
  /** One of {@link TRACK_TYPES}. Per-track, never global. */
  type: TRACK_TYPES.POSITIVE,
  /** Current value. Never negative in progress mode; may be in threshold mode. */
  current: 0,
  /** Progress needed to complete the track. Progress mode only. */
  target: 6,
  /**
   * Threshold mode: the value the track opens at and returns to on reset, and
   * the reference point every band's tone is measured against.
   */
  start: 0,
  /** Threshold mode: inclusive floor and ceiling for `current`. */
  min: 0,
  max: 12,
  /**
   * Threshold mode: the GM's ladder, `{id, value, label, description, announce}`.
   * Sanitization sorts it ascending by value and drops duplicate values, so the
   * band lookup can walk it in order.
   *
   * Kept even while the track is in progress mode: switching mode is a display
   * decision, and silently discarding a ladder the GM wrote would be worse than
   * carrying a few unused bytes.
   */
  thresholds: [],
  /**
   * Threshold mode: id of the band `current` sits in, or null when it is below
   * every threshold. Derived on every read, but *stored* as well, because the
   * announcement compares the band before a change with the band after it.
   */
  band: null,
  /** Threshold mode: announce band changes in chat. Per-track GM decision. */
  announceThresholds: true,
  /** Threshold mode: show players the whole ladder, not just their own band. */
  revealLadder: false,
  visibleToPlayers: true,
  /** Post a chat card when this track's progress changes. Gated by the world setting. */
  postToChat: true,
  status: STATUS.RUNNING,
  /**
   * The most recent counter change, shown in the HUD footer.
   * `{ delta: number, time: number }`
   */
  lastChange: { delta: 0, time: 0 },
  /**
   * Fields carried over from a pre-3.0 track, kept verbatim so a downgrade or a
   * manual repair can recover them. Never read by the running module.
   */
  legacy: null
});

/**
 * Clamp a value into an integer range. Uses a local implementation rather than
 * Math.clamp so the module does not depend on a specific core helper.
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clampInt(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/**
 * Percentage of the target reached, clamped to 0-100 for display purposes.
 * A target of 0 (which sanitization prevents, but stored data may still carry)
 * yields 0 rather than dividing by zero.
 * @param {number} current
 * @param {number} target
 * @returns {number}
 */
export function progressPercent(current, target) {
  if (!(Number(target) > 0)) return 0;
  return Math.min(100, Math.max(0, (Number(current) / Number(target)) * 100));
}

/**
 * The `stroke-dashoffset` that renders the given percentage on the ring.
 * 0% leaves the full circumference offset (empty ring), 100% leaves none.
 * @param {number} percent 0-100
 * @returns {number}
 */
export function ringDashOffset(percent) {
  const clamped = Math.min(100, Math.max(0, Number(percent) || 0));
  return Number((RING.CIRCUMFERENCE * (1 - clamped / 100)).toFixed(3));
}

/** Two decimal places, which is well past what a percentage position needs. */
const round2 = (n) => Number(n.toFixed(2));

/**
 * Where each seat of a rune circle sits, and where its rune hangs before it is
 * earned. Both are percentages of the plate, ready to drop into a `left`/`top`
 * pair, for the same reason the ring's dash offset is computed here: the
 * template stays free of arithmetic and the figure scales purely through CSS.
 *
 * Seats run clockwise from twelve o'clock, so a circle reads the way a GM
 * counts one.
 *
 * The adrift position is the seat's own angle pushed outward and knocked off
 * true. The two offsets are derived from the seat index rather than from
 * `Math.random`, which matters more than it looks: this runs on every render,
 * on every client, and a random scatter would mean an unearned rune jumped to a
 * new spot on every re-render and sat somewhere different on every player's
 * screen.
 *
 * @param {number} count How many seats the circle has.
 * @returns {Array<{index: number, left: number, top: number, adriftLeft: number,
 *   adriftTop: number, rotation: number}>}
 */
export function runeSeats(count) {
  const seats = Math.max(
    0,
    Math.min(CIRCLE.MAX_POSITIONS, Math.floor(Number(count) || 0))
  );
  const radians = Math.PI / 180;
  const list = [];

  for (let index = 0; index < seats; index += 1) {
    const angle = (-90 + (index * 360) / seats) * radians;
    // Coprime multipliers against the moduli, so short ladders still get a
    // spread rather than every seat landing on the same offset.
    const wobble = (((index * 37) % 19) - 9) * radians;
    const stray = ((index * 53) % 7) - 3;
    const adriftAngle = angle + wobble;
    const adriftRadius = CIRCLE.ADRIFT_RADIUS + stray;

    list.push({
      index,
      left: round2(50 + CIRCLE.SEAT_RADIUS * Math.cos(angle)),
      top: round2(50 + CIRCLE.SEAT_RADIUS * Math.sin(angle)),
      adriftLeft: round2(50 + adriftRadius * Math.cos(adriftAngle)),
      adriftTop: round2(50 + adriftRadius * Math.sin(adriftAngle)),
      // Tilt, so an unearned rune reads as out of order and not merely far out.
      rotation: ((index * 29) % 31) - 15
    });
  }
  return list;
}

/**
 * The threshold band a value sits in: the highest threshold whose value it has
 * reached, or null when it is below every threshold.
 *
 * Relies on the list being sorted ascending, which sanitization guarantees, so
 * the walk can stop at the first threshold the value has not reached.
 *
 * @param {number} value
 * @param {Array<{id: string, value: number}>} thresholds
 * @returns {object|null}
 */
export function resolveBand(value, thresholds) {
  const list = Array.isArray(thresholds) ? thresholds : [];
  const n = Number(value);
  if (!Number.isFinite(n)) return null;

  let found = null;
  for (const threshold of list) {
    if (n < Number(threshold.value)) break;
    found = threshold;
  }
  return found;
}

/**
 * How a band reads relative to where the track started.
 *
 * Deliberately derived rather than configured: a GM who sets the start to 6 and
 * thresholds at 0/3/6/9/12 has already said which end is which, and asking them
 * to tag each rung again would be a second chance to contradict themselves.
 *
 * A value below every threshold is worse than the lowest band, so it reads
 * negative.
 *
 * @param {{value: number}|null} threshold
 * @param {number} start
 * @returns {string} One of {@link BAND_TONES}.
 */
export function bandTone(threshold, start) {
  if (!threshold) return BAND_TONES.NEGATIVE;
  const value = Number(threshold.value);
  const base = Number(start);
  if (!Number.isFinite(value) || !Number.isFinite(base)) return BAND_TONES.NEUTRAL;
  if (value > base) return BAND_TONES.POSITIVE;
  if (value < base) return BAND_TONES.NEGATIVE;
  return BAND_TONES.NEUTRAL;
}

/**
 * Where a value sits on the `min`..`max` ladder, as a percentage, for drawing.
 * A degenerate range (max not above min) yields 0 rather than dividing by zero.
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number} 0-100
 */
export function ladderPercent(value, min, max) {
  const lo = Number(min);
  const hi = Number(max);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return 0;
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, ((n - lo) / (hi - lo)) * 100));
}

/**
 * Generate a short unique id for a new track.
 * @returns {string}
 */
export function generateId() {
  return foundry.utils.randomID(12);
}

/**
 * Debug-only console logging. Never used as the sole feedback channel for users.
 * @param {...any} args
 */
export function log(...args) {
  let debug = false;
  try {
    debug = game.settings.get(MODULE_ID, SETTINGS.DEBUG) === true;
  } catch {
    debug = false;
  }
  if (debug) console.log(`[${MODULE_ID}]`, ...args);
}

/** @param {...any} args */
export function warn(...args) {
  console.warn(`[${MODULE_ID}]`, ...args);
}

/**
 * Log an error. The stack trace is only surfaced when debug logging is enabled.
 * @param {string} message
 * @param {Error} [err]
 */
export function logError(message, err) {
  console.error(`[${MODULE_ID}] ${message}`);
  if (err) log(err);
}
