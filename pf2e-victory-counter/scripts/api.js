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
  adjustTrack,
  createTrack,
  getTrack,
  getTracks,
  hasUndo,
  moveTrack,
  removeTrack,
  resetTrackCounts,
  setTrackCounts,
  toggleTrackVisibility,
  undo,
  updateTrackConfig
} from "./state.js";

/**
 * @typedef {object} VictoryCounterAPI
 * @property {() => object[]}                                  getTracks
 * @property {(id: string) => object|null}                     getTrack
 * @property {(config: object) => Promise<object|null>}        create
 * @property {(id: string, config: object) => Promise<object|null>} configure
 * @property {(id: string, delta?: number) => Promise<object|null>} addSuccess
 * @property {(id: string, delta?: number) => Promise<object|null>} addFailure
 * @property {(id: string, s: number, f: number) => Promise<object|null>} setCounts
 * @property {(id: string) => Promise<object|null>}             reset
 * @property {(id: string) => Promise<object[]|null>}           end
 * @property {(id: string) => Promise<object|null>}             toggleVisibility
 * @property {(id: string, direction: -1|1) => Promise<object[]|null>} move
 * @property {() => Promise<object[]|null>}                     undo
 * @property {() => boolean}                                    canUndo
 * @property {() => Promise<void>}                              openPanel
 * @property {() => Promise<void>}                               showOverlay
 * @property {() => Promise<void>}                              toggleOverlay
 */

/** @type {VictoryCounterAPI} */
export const api = {
  /** All tracks (sanitized copies), in display order. */
  getTracks: () => getTracks(),

  /** A single track by id, or null. */
  getTrack: (id) => getTrack(id),

  /**
   * Create a new track.
   * @param {object} config `{title, requiredSuccesses, requiredFailures, trackFailures, visibleToPlayers}`
   */
  create: (config = {}) => createTrack(config),

  /** Change configuration of a track without resetting its counts. */
  configure: (id, config = {}) => updateTrackConfig(id, config),

  /** @param {string} id @param {number} [delta=1] */
  addSuccess: (id, delta = 1) => adjustTrack(id, "successes", delta),

  /** @param {string} id @param {number} [delta=1] */
  addFailure: (id, delta = 1) => adjustTrack(id, "failures", delta),

  /** @param {string} id @param {number} successes @param {number} failures */
  setCounts: (id, successes, failures) => setTrackCounts(id, successes, failures),

  /** Zero a track's counts, keeping it running. */
  reset: (id) => resetTrackCounts(id),

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
