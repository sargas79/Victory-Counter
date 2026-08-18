/**
 * Named hook handlers and the single UI refresh entry point.
 * Every hook is registered from {@link registerHooks} so the full surface of the
 * module is auditable in one place.
 *
 * Bootstrap resilience
 * --------------------
 * The two ApplicationV2 subclasses are loaded **lazily**, through dynamic
 * `import()` inside {@link loadApps}, rather than with a static import at the
 * top of this file.
 *
 * A static import makes the whole module a single failure domain: an ES module
 * that fails to parse takes its entire import graph with it, so one bad
 * character in `overlay.js` stops `registerHooks()` from ever running. The
 * visible result is not "the HUD is broken" but "the module has vanished" —
 * no scene control buttons, no settings, no API, and nothing but a raw
 * console error to work from.
 *
 * Loading the apps lazily keeps settings, state, migration, the scene control
 * buttons and the data half of the API working even when a UI module is
 * unloadable, and turns a silent disappearance into an actionable notification.
 *
 * @module pf2e-victory-counter/hooks
 */

import { MODULE_ID, STATUS, log, logError, warn } from "./constants.js";
import { exposeApi } from "./api.js";
import { getTracks, sanitizeTracks } from "./state.js";
import { registerSettings } from "./settings.js";
import { runMigration } from "./migration.js";

/** Tracks the last status rendered per track id, so completions announce once. */
const lastKnownStatus = new Map();

/* -------------------------------------------- */
/*  Lazy application loading                    */
/* -------------------------------------------- */

/** @type {Promise<{Overlay: any, Panel: any}>|null} */
let appsPromise = null;

/** Whether the "UI failed to load" notification has already been shown. */
let reportedAppFailure = false;

/**
 * Load the two application classes, once per session.
 *
 * A rejected promise is cached deliberately: a module that failed to parse will
 * fail identically on every retry, and re-importing on each refresh would spam
 * the console without ever succeeding.
 *
 * @returns {Promise<{Overlay: any, Panel: any}>}
 */
function loadApps() {
  if (!appsPromise) {
    appsPromise = Promise.all([
      import("./apps/overlay.js"),
      import("./apps/control-panel.js")
    ]).then(([overlay, panel]) => ({
      Overlay: overlay.VictoryCounterOverlay,
      Panel: panel.VictoryCounterPanel
    }));
  }
  return appsPromise;
}

/**
 * Run a callback against the loaded application classes, degrading to a single
 * actionable notification if they cannot be loaded.
 *
 * @template T
 * @param {(apps: {Overlay: any, Panel: any}) => Promise<T>|T} callback
 * @param {string} context Short description used in the console error.
 * @returns {Promise<T|null>}
 */
async function withApps(callback, context) {
  let apps;
  try {
    apps = await loadApps();
  } catch (err) {
    logError(`The victory counter interface could not be loaded (${context}).`, err);
    if (!reportedAppFailure) {
      reportedAppFailure = true;
      // ui may not exist yet if this somehow runs before `ready`.
      ui?.notifications?.error(game.i18n.localize("PVC.Notify.UILoadFailed"), {
        permanent: true
      });
    }
    return null;
  }
  return callback(apps);
}

/**
 * Whether the interface modules are known to be unloadable.
 * @returns {boolean}
 */
export function uiFailedToLoad() {
  return reportedAppFailure;
}

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
  } catch (err) {
    logError("Failed to evaluate track state for the UI refresh.", err);
  }

  // Redrawing is a separate concern from the bookkeeping above: a UI module that
  // cannot load must not stop completion notifications from being announced.
  await withApps(async ({ Overlay, Panel }) => {
    try {
      await Overlay.refresh();
      await Panel.refresh();
    } catch (err) {
      logError("Failed to refresh the victory counter UI.", err);
    }
  }, "refresh");
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
 *
 * Registered unconditionally. The buttons are the module's only entry point in
 * the UI, so they must appear even when the applications behind them cannot be
 * loaded — clicking one then explains the problem instead of doing nothing.
 *
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
    onChange: () => withApps(({ Overlay }) => Overlay.toggleVisibility(), "toggle overlay")
  };

  tokens.tools.pvcOpenPanel = {
    name: "pvcOpenPanel",
    title: "PVC.Controls.OpenPanel",
    icon: "fa-solid fa-sliders",
    order: order + 2,
    button: true,
    visible: game.user.isGM,
    onChange: () => withApps(({ Panel }) => Panel.toggle(), "open control panel")
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
