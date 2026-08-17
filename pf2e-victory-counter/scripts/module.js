/**
 * PF2e Victory Counter — module entry point.
 *
 * A shared victory point / success tracker for Pathfinder 2e Remaster subsystem
 * challenges. The GM initializes a challenge and adjusts progress; every player
 * sees the same live state in a collapsible on-screen overlay.
 *
 * The module stores its entire state in two world-scoped settings and never
 * reads or writes Actors, Items, Scenes, Journals or any other world document.
 *
 * @module pf2e-victory-counter
 */

import { registerHooks } from "./hooks.js";

registerHooks();
