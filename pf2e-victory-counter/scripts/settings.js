/**
 * Setting registration. Called once from the `init` hook.
 * @module pf2e-victory-counter/settings
 */

import {
  MODULE_ID,
  OVERLAY_POSITIONS,
  SETTINGS,
  log
} from "./constants.js";

/**
 * Register every module setting.
 *
 * Data safety note: the module stores *only* these settings. It never creates,
 * updates or deletes Actors, Items, Scenes, Journals or any other world
 * document, so "uninstall cleanup" is limited to clearing the tracks.
 *
 * @param {() => void} onStateChange Invoked on every client when shared state changes.
 * @param {() => void} onLocalChange Invoked on the local client when a display preference changes.
 */
export function registerSettings(onStateChange, onLocalChange) {
  // --- Shared state (world scope, hidden from the settings menu) ----------

  game.settings.register(MODULE_ID, SETTINGS.TRACKS, {
    name: "PVC.Settings.Tracks.Name",
    scope: "world",
    config: false,
    type: Array,
    default: [],
    onChange: () => {
      log("Tracks setting changed; refreshing overlay.");
      onStateChange();
    }
  });

  game.settings.register(MODULE_ID, SETTINGS.UNDO, {
    name: "PVC.Settings.Undo.Name",
    scope: "world",
    config: false,
    type: Object,
    default: {}
  });

  // --- Per-user display preferences (client scope) ------------------------

  game.settings.register(MODULE_ID, SETTINGS.OVERLAY_HIDDEN, {
    name: "PVC.Settings.OverlayHidden.Name",
    scope: "client",
    config: false,
    type: Boolean,
    default: false,
    onChange: () => onLocalChange()
  });

  game.settings.register(MODULE_ID, SETTINGS.OVERLAY_COLLAPSED, {
    name: "PVC.Settings.OverlayCollapsed.Name",
    scope: "client",
    config: false,
    type: Boolean,
    default: false,
    onChange: () => onLocalChange()
  });

  game.settings.register(MODULE_ID, SETTINGS.OVERLAY_POSITION, {
    name: "PVC.Settings.OverlayPosition.Name",
    hint: "PVC.Settings.OverlayPosition.Hint",
    scope: "client",
    config: true,
    type: String,
    default: "top-center",
    choices: { ...OVERLAY_POSITIONS },
    onChange: () => onLocalChange()
  });

  // Written by dragging the HUD. Deliberately has no onChange: the drag handler
  // already positions the element, so re-rendering here would fight the drag.
  game.settings.register(MODULE_ID, SETTINGS.OVERLAY_OFFSET, {
    name: "PVC.Settings.OverlayOffset.Name",
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });

  game.settings.register(MODULE_ID, SETTINGS.OVERLAY_SCALE, {
    name: "PVC.Settings.OverlayScale.Name",
    hint: "PVC.Settings.OverlayScale.Hint",
    scope: "client",
    config: true,
    type: Number,
    default: 1,
    range: { min: 0.6, max: 1.6, step: 0.1 },
    onChange: () => onLocalChange()
  });

  // --- GM behaviour toggles (world scope, GM-only) ------------------------

  game.settings.register(MODULE_ID, SETTINGS.POST_CHAT, {
    name: "PVC.Settings.PostChat.Name",
    hint: "PVC.Settings.PostChat.Hint",
    scope: "world",
    config: true,
    restricted: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, SETTINGS.DEBUG, {
    name: "PVC.Settings.Debug.Name",
    hint: "PVC.Settings.Debug.Hint",
    scope: "world",
    config: true,
    restricted: true,
    type: Boolean,
    default: false
  });

  log("Settings registered.");
}
