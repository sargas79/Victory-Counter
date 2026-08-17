/**
 * Named hook handlers and the single UI refresh entry point.
 * Every hook is registered from {@link registerHooks} so the full surface of the
 * module is auditable in one place.
 *
 * @module pf2e-victory-counter/hooks
 */

import { MODULE_ID, STATUS, log, logError, warn } from "./constants.js";
import { VictoryCounterPanel } from "./apps/control-panel.js";
import { VictoryCounterOverlay } from "./apps/overlay.js";
import { exposeApi } from "./api.js";
import { getTracks, sanitizeTracks } from "./state.js";
import { registerSettings } from "./settings.js";
import { runMigration } from "./migration.js";

/** Tracks the last status rendered per track id, so completions announce once. */
const lastKnownStatus = new Map();

/* -------------------------------------------- */
/*  Refresh                                     */
/* -------------------------------------------- */

/**
 * Bring every piece of this client's UI in line with the current shared state.
 * Called on setting changes (shared and local) and on `ready`.
 * @param {object} [options]
 * @param {boolean} [options.announce=true] Show a notification when a track completes.
 * @returns {Promise<void>}
 */
export async function refreshUI({ announce = true } = {}) {
  try {
    const tracks = getTracks();
    const seenIds = new Set();

    for (const track of tracks) {
      seenIds.add(track.id);
      const previousStatus = lastKnownStatus.get(track.id);
      if (
        announce &&
        track.active &&
        track.status === STATUS.COMPLETE &&
        track.status !== previousStatus
      ) {
        ui.notifications.info(
          game.i18n.format("PVC.Notify.Complete", {
            title: track.title || game.i18n.localize("PVC.DefaultTitle")
          })
        );
      }
      lastKnownStatus.set(track.id, track.active ? track.status : undefined);
    }

    // Drop bookkeeping for tracks that no longer exist.
    for (const id of lastKnownStatus.keys()) {
      if (!seenIds.has(id)) lastKnownStatus.delete(id);
    }

    await VictoryCounterOverlay.refresh();
    await VictoryCounterPanel.refresh();
  } catch (err) {
    logError("Failed to refresh the victory counter UI.", err);
  }
}

/**
 * Refresh triggered by a purely local display preference change.
 * @returns {Promise<void>}
 */
export async function refreshLocal() {
  await refreshUI({ announce: false });
}

/* -------------------------------------------- */
/*  Hook handlers                               */
/* -------------------------------------------- */

/** `init` — register settings before anything else touches them. */
function onInit() {
  registerSettings(
    () => refreshUI(),
    () => refreshLocal()
  );
  log("Initialized.");
}

/** `setup` — verify the game system and preload templates. */
async function onSetup() {
  if (game.system.id !== "pf2e") {
    warn(
      `This module targets the Pathfinder 2e system; the active system is "${game.system.id}". ` +
        "The counter is system-agnostic and should still work, but it is untested here."
    );
  }
  try {
    await foundry.applications.handlebars.loadTemplates([
      `modules/${MODULE_ID}/templates/overlay.hbs`,
      `modules/${MODULE_ID}/templates/control-panel.hbs`,
      `modules/${MODULE_ID}/templates/chat-card.hbs`,
      `modules/${MODULE_ID}/templates/progress-ring.hbs`
    ]);
  } catch (err) {
    logError("Failed to preload templates.", err);
  }
}

/**
 * `ready` — migrate stored data (GM only), expose the API, and draw the overlay.
 *
 * Reads are migrated in memory on every client regardless, so a world whose GM
 * has not yet logged in still renders correctly for players.
 */
async function onReady() {
  try {
    await runMigration(sanitizeTracks);
  } catch (err) {
    logError("Track data migration failed; continuing with in-memory migration only.", err);
  }

  exposeApi();
  await refreshUI({ announce: false });
  log(`Ready. PF2e system version: ${game.system.version}. Core: ${game.version}.`);
}

/**
 * `getSceneControlButtons` — add a user-facing overlay toggle and a GM-only
 * control panel button to the Token controls.
 * @param {Record<string, object>} controls
 */
function onGetSceneControlButtons(controls) {
  const tokens = controls?.tokens;
  if (!tokens?.tools) {
    warn("Token scene controls were not available; skipping button registration.");
    return;
  }

  const order = Object.keys(tokens.tools).length;

  tokens.tools.pvcToggleOverlay = {
    name: "pvcToggleOverlay",
    title: "PVC.Controls.ToggleOverlay",
    icon: "fa-solid fa-trophy",
    order: order + 1,
    button: true,
    visible: true,
    onChange: () => VictoryCounterOverlay.toggleVisibility()
  };

  tokens.tools.pvcOpenPanel = {
    name: "pvcOpenPanel",
    title: "PVC.Controls.OpenPanel",
    icon: "fa-solid fa-sliders",
    order: order + 2,
    button: true,
    visible: game.user.isGM,
    onChange: () => VictoryCounterPanel.toggle()
  };
}

/* -------------------------------------------- */
/*  Registration                                */
/* -------------------------------------------- */

/**
 * Register every hook used by this module.
 * Kept as a single explicit list for auditability.
 */
export function registerHooks() {
  Hooks.once("init", onInit);
  Hooks.once("setup", onSetup);
  Hooks.once("ready", onReady);
  Hooks.on("getSceneControlButtons", onGetSceneControlButtons);
}
