/**
 * Shared constants and small utilities for the PF2e Victory Counter module.
 * @module pf2e-victory-counter/constants
 */

export const MODULE_ID = "pf2e-victory-counter";

/** Setting keys, namespaced under the module. */
export const SETTINGS = Object.freeze({
  /** World scope. The list of active tracks (plain objects). */
  TRACKS: "tracks",
  /** World scope. One-level undo snapshot of the previous tracks array. */
  UNDO: "undoBuffer",
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
  /** World scope. Post a chat card whenever a track's state changes. */
  POST_CHAT: "postChatUpdates",
  /** World scope. Verbose console logging. */
  DEBUG: "debug"
});

/** Current persisted schema version for a track object. */
export const SCHEMA_VERSION = 2;

/** Resolution states a track can be in. */
export const STATUS = Object.freeze({
  RUNNING: "running",
  WON: "won",
  LOST: "lost"
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
  MIN_REQUIRED: 1,
  MAX_REQUIRED: 100,
  MAX_COUNT: 999,
  MAX_TITLE_LENGTH: 80,
  MAX_TRACKS: 10
});

/**
 * The immutable default shape of a single track. Any stored value is merged
 * onto a clone of this object with `insertKeys: false`, so unknown keys are
 * discarded and missing keys are backfilled. That is the module's entire
 * migration story.
 * @type {Readonly<object>}
 */
export const DEFAULT_TRACK = Object.freeze({
  schema: SCHEMA_VERSION,
  id: "",
  active: false,
  title: "",
  successes: 0,
  failures: 0,
  requiredSuccesses: 6,
  requiredFailures: 3,
  trackFailures: true,
  visibleToPlayers: true,
  status: STATUS.RUNNING,
  /**
   * The most recent counter change, shown in the HUD footer.
   * `{ track: "successes"|"failures"|"", delta: number, time: number }`
   */
  lastChange: { track: "", delta: 0, time: 0 }
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
