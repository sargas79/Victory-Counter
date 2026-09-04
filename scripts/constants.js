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
 */
export const SCHEMA_VERSION = 4;

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
  MIN_PANEL_HEIGHT: 320
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
