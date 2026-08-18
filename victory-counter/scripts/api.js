/**
 * Public module API, exposed as `game.modules.get("victory-counter").api`.
 * Every mutating method is GM-guarded inside the state layer, so macros written
 * by players fail safely with a notification rather than silently doing nothing.
 *
 * @module victory-counter/api
 */

import { MODULE_ID, TRACK_TYPES, logError, warn } from "./constants.js";
import {
  adjustTrack,
  createTrack,
  getTrack,
  getTracks,
  hasUndo,
  moveTrack,
  removeTrack,
  resetTrackProgress,
  setTrackCurrent,
  setTrackType,
  toggleTrackVisibility,
  undo,
  updateTrackConfig
} from "./state.js";

/**
 * One-time deprecation notice per method name, so a macro in a loop does not
 * flood the console.
 * @type {Set<string>}
 */
const warned = new Set();

/**
 * Load an application class on demand.
 *
 * The apps are imported lazily rather than statically for the same reason as in
 * `hooks.js`: a UI module that fails to parse would otherwise take the entire
 * API down with it, leaving macros that only read or mutate track data broken
 * for no reason. See the bootstrap note in `hooks.js`.
 *
 * @param {"overlay"|"panel"} which
 * @returns {Promise<any|null>} The class, or null if it could not be loaded.
 */
async function loadApp(which) {
  try {
    if (which === "overlay") {
      return (await import("./apps/overlay.js")).VictoryCounterOverlay;
    }
    return (await import("./apps/control-panel.js")).VictoryCounterPanel;
  } catch (err) {
    logError(`The victory counter interface could not be loaded (api.${which}).`, err);
    ui?.notifications?.error(game.i18n.localize("PVC.Notify.UILoadFailed"));
    return null;
  }
}

/**
 * @param {string} oldName
 * @param {string} newName
 */
function deprecate(oldName, newName) {
  if (warned.has(oldName)) return;
  warned.add(oldName);
  warn(`api.${oldName}() is deprecated and will be removed in 4.0. Use api.${newName}() instead.`);
}

/**
 * @typedef {object} VictoryCounterAPI
 * @property {() => object[]}                                        getTracks
 * @property {(id: string) => object|null}                           getTrack
 * @property {(config: object) => Promise<object|null>}              create
 * @property {(id: string, config: object) => Promise<object|null>}  configure
 * @property {(id: string, type: string) => Promise<object|null>}    setType
 * @property {(id: string, amount?: number) => Promise<object|null>} increase
 * @property {(id: string, amount?: number) => Promise<object|null>} decrease
 * @property {(id: string, delta: number) => Promise<object|null>}   adjust
 * @property {(id: string, value: number) => Promise<object|null>}   setProgress
 * @property {(id: string) => Promise<object|null>}                  reset
 * @property {(id: string) => Promise<object[]|null>}                end
 * @property {(id: string) => Promise<object|null>}                  toggleVisibility
 * @property {(id: string, direction: -1|1) => Promise<object[]|null>} move
 * @property {() => Promise<object[]|null>}                          undo
 * @property {() => boolean}                                         canUndo
 * @property {() => Promise<void>}                                   openPanel
 * @property {() => Promise<void>}                                   showOverlay
 * @property {() => Promise<void>}                                   toggleOverlay
 */

/** @type {VictoryCounterAPI} */
export const api = {
  /** Polarity values, for macros that want to avoid magic strings. */
  TYPES: { ...TRACK_TYPES },

  /** All tracks (sanitized copies), in display order. */
  getTracks: () => getTracks(),

  /** A single track by id, or null. */
  getTrack: (id) => getTrack(id),

  /**
   * Create a new track. Defaults to a positive track.
   * @param {object} config `{title, target, type, visibleToPlayers}`
   */
  create: (config = {}) => createTrack(config),

  /** Change configuration of a track without resetting its progress. */
  configure: (id, config = {}) => updateTrackConfig(id, config),

  /** Set a track's polarity: `"positive"` or `"negative"`. */
  setType: (id, type) => setTrackType(id, type),

  /** @param {string} id @param {number} [amount=1] */
  increase: (id, amount = 1) => adjustTrack(id, Math.abs(Number(amount) || 0)),

  /** @param {string} id @param {number} [amount=1] */
  decrease: (id, amount = 1) => adjustTrack(id, -Math.abs(Number(amount) || 0)),

  /** Signed adjustment. Progress is clamped to 0 and to the completion rules. */
  adjust: (id, delta) => adjustTrack(id, delta),

  /** Set a track's progress directly. */
  setProgress: (id, value) => setTrackCurrent(id, value),

  /** Zero a track's progress, keeping it running. */
  reset: (id) => resetTrackProgress(id),

  /** Remove a track and clear it from all screens. */
  end: (id) => removeTrack(id),

  /** Flip whether players can see a specific track. */
  toggleVisibility: (id) => toggleTrackVisibility(id),

  /** Reorder a track up (-1) or down (1). */
  move: (id, direction) => moveTrack(id, direction),

  /** Restore the single-level undo snapshot for the whole track list. */
  undo: () => undo(),

  /** @returns {boolean} */
  canUndo: () => hasUndo(),

  /** Open the GM control panel. Resolves to false if the UI cannot be loaded. */
  openPanel: async () => {
    const Panel = await loadApp("panel");
    if (!Panel) return false;
    await Panel.show();
    return true;
  },

  /** Un-hide the overlay for the current user. */
  showOverlay: async () => {
    const Overlay = await loadApp("overlay");
    if (!Overlay) return false;
    await Overlay.reveal();
    return true;
  },

  /** Toggle the overlay for the current user. */
  toggleOverlay: async () => {
    const Overlay = await loadApp("overlay");
    if (!Overlay) return false;
    await Overlay.toggleVisibility();
    return true;
  },

  /* ------------------------------------------ */
  /*  Deprecated 2.x shims                      */
  /* ------------------------------------------ */

  /**
   * @deprecated Use {@link api.increase}.
   * @param {string} id @param {number} [delta=1]
   */
  addSuccess: (id, delta = 1) => {
    deprecate("addSuccess", "increase");
    return adjustTrack(id, delta);
  },

  /**
   * @deprecated Failure tracking was removed in 3.0. Model a "bad" track as a
   * separate negative-polarity track instead. Returns null without writing.
   */
  addFailure: () => {
    deprecate("addFailure", "create({ type: 'negative' }) + increase");
    ui.notifications.warn(game.i18n.localize("PVC.Notify.FailuresRemoved"));
    return Promise.resolve(null);
  },

  /**
   * @deprecated Use {@link api.setProgress}. The second count is ignored.
   * @param {string} id @param {number} value
   */
  setCounts: (id, value) => {
    deprecate("setCounts", "setProgress");
    return setTrackCurrent(id, value);
  }
};

/**
 * Attach the API to the module document so macros and other modules can use it.
 */
export function exposeApi() {
  const mod = game.modules.get(MODULE_ID);
  if (!mod) return;
  mod.api = api;
}
