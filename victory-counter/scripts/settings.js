/**
 * Setting registration. Called once from the `init` hook.
 * @module victory-counter/settings
 */

import {
  LIMITS,
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

  // Schema version of the data currently in SETTINGS.TRACKS. 0 means "never
  // migrated", which is also the correct answer for a brand new world (there
  // is nothing to migrate, and the first write stamps the current version).
  game.settings.register(MODULE_ID, SETTINGS.SCHEMA, {
    name: "PVC.Settings.Schema.Name",
    scope: "world",
    config: false,
    type: Number,
    default: 0
  });

  // Verbatim copy of the pre-3.0 track array, written once by the migration and
  // never read by the running module. Kept so nothing is lost irreversibly.
  game.settings.register(MODULE_ID, SETTINGS.LEGACY_BACKUP, {
    name: "PVC.Settings.LegacyBackup.Name",
    scope: "world",
    config: false,
    type: Object,
    default: {}
  });

  // Latch for the one-time import from the pre-4.0 `pf2e-victory-counter` id.
  // Written whether or not anything was found, so the lookup runs exactly once.
  game.settings.register(MODULE_ID, SETTINGS.IMPORTED_LEGACY_MODULE, {
    name: "PVC.Settings.ImportedLegacyModule.Name",
    scope: "world",
    config: false,
    type: Boolean,
    default: false
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

  // Written by the HUD resize grip. Same reasoning as the drag offset: the grip
  // sets the width live, so an onChange re-render would fight the pointer.
  game.settings.register(MODULE_ID, SETTINGS.OVERLAY_WIDTH, {
    name: "PVC.Settings.OverlayWidth.Name",
    hint: "PVC.Settings.OverlayWidth.Hint",
    scope: "client",
    config: true,
    type: Number,
    default: 320,
    range: {
      min: LIMITS.MIN_OVERLAY_WIDTH,
      max: LIMITS.MAX_OVERLAY_WIDTH,
      step: 8
    },
    onChange: () => onLocalChange()
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

  game.settings.register(MODULE_ID, SETTINGS.SHOW_RINGS, {
    name: "PVC.Settings.ShowRings.Name",
    hint: "PVC.Settings.ShowRings.Hint",
    scope: "world",
    config: true,
    restricted: true,
    type: Boolean,
    default: true,
    onChange: () => onStateChange()
  });

  game.settings.register(MODULE_ID, SETTINGS.ALLOW_OVERSHOOT, {
    name: "PVC.Settings.AllowOvershoot.Name",
    hint: "PVC.Settings.AllowOvershoot.Hint",
    scope: "world",
    config: true,
    restricted: true,
    type: Boolean,
    default: false,
    onChange: () => onStateChange()
  });

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
