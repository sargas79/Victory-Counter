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
 */
export const SCHEMA_VERSION = 3;

/** Resolution states a track can be in. */
export const STATUS = Object.freeze({
  RUNNING: "running",
  COMPLETE: "complete"
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
  /** One of {@link TRACK_TYPES}. Per-track, never global. */
  type: TRACK_TYPES.POSITIVE,
  /** Current progress. Never negative. */
  current: 0,
  /** Progress needed to complete the track. */
  target: 6,
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
