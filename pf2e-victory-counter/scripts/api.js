/**
 * Public module API, exposed as `game.modules.get("pf2e-victory-counter").api`.
 * Every mutating method is GM-guarded inside the state layer, so macros written
 * by players fail safely with a notification rather than silently doing nothing.
 *
 * @module pf2e-victory-counter/api
 */

import { MODULE_ID } from "./constants.js";
import { VictoryCounterPanel } from "./apps/control-panel.js";
import { VictoryCounterOverlay } from "./apps/overlay.js";
import {
  adjust,
  clearChallenge,
  getChallenge,
  hasUndo,
  resetCounts,
  setCounts,
  startChallenge,
  undo,
  updateConfig
} from "./state.js";

/**
 * @typedef {object} VictoryCounterAPI
 * @property {() => object}                       getChallenge
 * @property {(config: object) => Promise<object|null>} start
 * @property {(config: object) => Promise<object|null>} configure
 * @property {(delta?: number) => Promise<object|null>} addSuccess
 * @property {(delta?: number) => Promise<object|null>} addFailure
 * @property {(s: number, f: number) => Promise<object|null>} setCounts
 * @property {() => Promise<object|null>}          reset
 * @property {() => Promise<object|null>}          end
 * @property {() => Promise<object|null>}          undo
 * @property {() => boolean}                       canUndo
 * @property {() => Promise<void>}                 openPanel
 * @property {() => Promise<void>}                 showOverlay
 * @property {() => Promise<void>}                 toggleOverlay
 */

/** @type {VictoryCounterAPI} */
export const api = {
  /** The current challenge state (sanitized copy). */
  getChallenge: () => getChallenge(),

  /**
   * Start a new challenge, resetting counts to zero.
   * @param {object} config `{title, requiredSuccesses, requiredFailures, trackFailures, visibleToPlayers}`
   */
  start: (config = {}) => startChallenge(config),

  /** Change configuration of the running challenge without resetting counts. */
  configure: (config = {}) => updateConfig(config),

  /** @param {number} [delta=1] */
  addSuccess: (delta = 1) => adjust("successes", delta),

  /** @param {number} [delta=1] */
  addFailure: (delta = 1) => adjust("failures", delta),

  /** @param {number} successes @param {number} failures */
  setCounts: (successes, failures) => setCounts(successes, failures),

  /** Zero both counts, keeping the challenge running. */
  reset: () => resetCounts(),

  /** End the challenge and clear it from all screens. */
  end: () => clearChallenge(),

  /** Restore the single-level undo snapshot. */
  undo: () => undo(),

  /** @returns {boolean} */
  canUndo: () => hasUndo(),

  /** Open the GM control panel. */
  openPanel: () => VictoryCounterPanel.show(),

  /** Un-hide the overlay for the current user. */
  showOverlay: () => VictoryCounterOverlay.reveal(),

  /** Toggle the overlay for the current user. */
  toggleOverlay: () => VictoryCounterOverlay.toggleVisibility()
};

/**
 * Attach the API to the module document so macros and other modules can use it.
 */
export function exposeApi() {
  const mod = game.modules.get(MODULE_ID);
  if (!mod) return;
  mod.api = api;
}
