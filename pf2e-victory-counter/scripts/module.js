/**
 * PF2e Victory Counter — module entry point.
 *
 * A shared multi-track progress counter for Pathfinder 2e Remaster subsystem
 * challenges. The GM creates any number of named tracks and adjusts progress;
 * every player sees the same live state in a collapsible on-screen overlay.
 *
 * The module stores its entire state in world-scoped settings and never reads
 * or writes Actors, Items, Scenes, Journals or any other world document.
 *
 * @module pf2e-victory-counter
 */

import { registerHooks } from "./hooks.js";

// A throw here would leave the module with no hooks at all: no settings, no
// scene control buttons, and no indication in the interface that anything is
// wrong. Reporting it explicitly turns a silent disappearance into a message
// that names the module and points at the console.
try {
  registerHooks();
} catch (err) {
  console.error(
    "[pf2e-victory-counter] Failed to register hooks. The module will not " +
      "appear in the scene controls. This usually means a module file is " +
      "damaged or was only partially deployed — reinstall the module folder.",
    err
  );
  Hooks.once("ready", () => {
    ui?.notifications?.error(
      game.i18n.localize("PVC.Notify.BootstrapFailed"),
      { permanent: true }
    );
  });
}
