/**
 * The shared Victory Points HUD every user sees.
 *
 * Implemented as an ApplicationV2 with `window.frame = false` and
 * `window.positioned = false`, so Foundry renders the element but leaves
 * placement to CSS plus the drag handler below. Layout follows variant 1a of
 * the Nocturne "Victory Points HUD" design, with the 1e compact bar as the
 * collapsed state.
 *
 * @module pf2e-victory-counter/apps/overlay
 */

import { MODULE_ID, OVERLAY_POSITIONS, SETTINGS, STATUS, clampInt, log } from "../constants.js";
import {
  adjust,
  canUserSee,
  getChallenge,
  hasUndo,
  setCounts,
  togglePlayerVisibility,
  undo
} from "../state.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * @param {number} value
 * @param {number} required
 * @returns {number} A 0-100 percentage, clamped.
 */
function percent(value, required) {
  if (!required) return 0;
  return Math.min(100, Math.max(0, Math.round((value / required) * 100)));
}

export class VictoryCounterOverlay extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: "pvc-overlay",
    tag: "div",
    classes: ["pvc", "pvc-overlay"],
    window: {
      frame: false,
      positioned: false
    },
    actions: {
      toggleCollapse: this.onToggleCollapse,
      hideOverlay: this.onHideOverlay,
      openPanel: this.onOpenPanel,
      adjustTrack: this.onAdjustTrack,
      togglePlayerVisibility: this.onTogglePlayerVisibility,
      undoChange: this.onUndoChange
    }
  };

  /** @override */
  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/overlay.hbs` }
  };

  /* ---------------------------------------- */
  /*  Context                                 */
  /* ---------------------------------------- */

  /** @override */
  async _prepareContext(_options) {
    const challenge = getChallenge();
    const collapsed = game.settings.get(MODULE_ID, SETTINGS.OVERLAY_COLLAPSED) === true;

    return {
      challenge,
      collapsed,
      isGM: game.user.isGM,
      canUndo: hasUndo(),
      displayTitle: challenge.title || game.i18n.localize("PVC.DefaultTitle"),
      successPercent: percent(challenge.successes, challenge.requiredSuccesses),
      failurePercent: percent(challenge.failures, challenge.requiredFailures),
      statusLabel: game.i18n.localize(`PVC.Status.${challenge.status}`),
      lastChange: this.#formatLastChange(challenge)
    };
  }

  /**
   * Format the footer log line, or null when nothing has been recorded yet.
   * @param {object} challenge
   * @returns {{label: string, track: string, time: string}|null}
   */
  #formatLastChange(challenge) {
    const change = challenge.lastChange;
    if (!change?.track || !change.delta || !change.time) return null;
    return {
      label: change.delta > 0 ? `+${change.delta}` : String(change.delta),
      track: game.i18n.localize(
        change.track === "successes" ? "PVC.Successes" : "PVC.Failures"
      ),
      time: new Date(change.time).toLocaleTimeString(game.i18n.lang, {
        hour: "2-digit",
        minute: "2-digit"
      })
    };
  }

  /* ---------------------------------------- */
  /*  Render                                  */
  /* ---------------------------------------- */

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    const el = this.element;
    if (!el) return;

    this.#applyPlacement(el);
    this.#applyStatusClasses(el, context);
    this.#bindDragHandle(el);
    this.#bindSetInputs(el);
  }

  /**
   * Position the HUD: a free-drag offset wins if the user has moved it,
   * otherwise the chosen screen anchor applies. Offsets are clamped into the
   * viewport so a stale value can never strand the HUD off screen.
   * @param {HTMLElement} el
   */
  #applyPlacement(el) {
    const scale = Number(game.settings.get(MODULE_ID, SETTINGS.OVERLAY_SCALE)) || 1;
    el.style.setProperty("--pvc-scale", String(Math.min(1.6, Math.max(0.6, scale))));

    for (const key of Object.keys(OVERLAY_POSITIONS)) el.classList.remove(`pvc-at-${key}`);
    el.classList.remove("pvc-free");
    el.style.removeProperty("left");
    el.style.removeProperty("top");

    const offset = game.settings.get(MODULE_ID, SETTINGS.OVERLAY_OFFSET);
    if (Number.isFinite(offset?.left) && Number.isFinite(offset?.top)) {
      const maxLeft = Math.max(0, window.innerWidth - 80);
      const maxTop = Math.max(0, window.innerHeight - 40);
      el.classList.add("pvc-free");
      el.style.left = `${clampInt(offset.left, 0, maxLeft)}px`;
      el.style.top = `${clampInt(offset.top, 0, maxTop)}px`;
      return;
    }

    const anchor = game.settings.get(MODULE_ID, SETTINGS.OVERLAY_POSITION);
    el.classList.add(`pvc-at-${OVERLAY_POSITIONS[anchor] ? anchor : "top-center"}`);
  }

  /**
   * @param {HTMLElement} el
   * @param {object} context
   */
  #applyStatusClasses(el, context) {
    el.classList.remove("pvc-running", "pvc-won", "pvc-lost");
    el.classList.add(`pvc-${context.challenge.status}`);
    el.classList.toggle("pvc-collapsed", context.collapsed);
    el.classList.toggle("pvc-gm", context.isGM);
    el.classList.toggle("pvc-resolved", context.challenge.status !== STATUS.RUNNING);
  }

  /**
   * Make the title bar / compact bar draggable. The resulting position is a
   * per-user client setting, so moving the HUD never touches shared state.
   * @param {HTMLElement} el
   */
  #bindDragHandle(el) {
    const handle = el.querySelector("[data-drag-handle]");
    if (!handle) return;

    handle.addEventListener("pointerdown", (event) => {
      // Let buttons and inputs inside the bar behave normally.
      if (event.button !== 0) return;
      if (event.target.closest("button, input")) return;

      event.preventDefault();
      const rect = el.getBoundingClientRect();
      const grabX = event.clientX - rect.left;
      const grabY = event.clientY - rect.top;
      el.classList.add("pvc-dragging", "pvc-free");

      const onMove = (moveEvent) => {
        const maxLeft = Math.max(0, window.innerWidth - rect.width);
        const maxTop = Math.max(0, window.innerHeight - rect.height);
        el.style.left = `${clampInt(moveEvent.clientX - grabX, 0, maxLeft)}px`;
        el.style.top = `${clampInt(moveEvent.clientY - grabY, 0, maxTop)}px`;
      };

      const onUp = async () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        el.classList.remove("pvc-dragging");
        const left = parseInt(el.style.left, 10);
        const top = parseInt(el.style.top, 10);
        if (Number.isFinite(left) && Number.isFinite(top)) {
          await game.settings.set(MODULE_ID, SETTINGS.OVERLAY_OFFSET, { left, top });
          log("Overlay moved", { left, top });
        }
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    });

    // Double-clicking the bar returns the HUD to its configured anchor.
    handle.addEventListener("dblclick", async (event) => {
      if (event.target.closest("button, input")) return;
      await game.settings.set(MODULE_ID, SETTINGS.OVERLAY_OFFSET, {});
      this.#applyPlacement(el);
      ui.notifications.info(game.i18n.localize("PVC.Notify.PositionReset"));
    });
  }

  /**
   * Wire the GM "set" fields: type a number, press Enter, the count is set.
   * @param {HTMLElement} el
   */
  #bindSetInputs(el) {
    if (!game.user.isGM) return;
    for (const input of el.querySelectorAll(".pvc-set")) {
      input.addEventListener("keydown", async (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        event.stopPropagation();

        const raw = input.value.trim();
        input.value = "";
        if (raw === "") return;

        const value = Number(raw);
        if (!Number.isFinite(value)) {
          ui.notifications.warn(game.i18n.localize("PVC.Notify.NotANumber"));
          return;
        }

        const challenge = getChallenge();
        const track = input.dataset.setTrack;
        if (track === "failures") await setCounts(challenge.successes, value);
        else await setCounts(value, challenge.failures);
      });
    }
  }

  /* ---------------------------------------- */
  /*  Actions                                 */
  /* ---------------------------------------- */

  /**
   * Collapse or expand the HUD for this user only.
   * @this {VictoryCounterOverlay}
   */
  static async onToggleCollapse() {
    const current = game.settings.get(MODULE_ID, SETTINGS.OVERLAY_COLLAPSED) === true;
    await game.settings.set(MODULE_ID, SETTINGS.OVERLAY_COLLAPSED, !current);
  }

  /**
   * Dismiss the HUD for this user only. Reopened from the Token scene controls.
   * @this {VictoryCounterOverlay}
   */
  static async onHideOverlay() {
    await game.settings.set(MODULE_ID, SETTINGS.OVERLAY_HIDDEN, true);
    ui.notifications.info(game.i18n.localize("PVC.Notify.OverlayHidden"));
  }

  /**
   * GM shortcut to the control panel.
   * @this {VictoryCounterOverlay}
   */
  static async onOpenPanel() {
    if (!game.user.isGM) return;
    const { VictoryCounterPanel } = await import("./control-panel.js");
    await VictoryCounterPanel.show();
  }

  /**
   * GM quick adjustment directly from the HUD.
   * @this {VictoryCounterOverlay}
   * @param {PointerEvent} event
   * @param {HTMLElement}  target
   */
  static async onAdjustTrack(event, target) {
    if (!game.user.isGM) return;
    const delta = Number(target.dataset.delta);
    if (!Number.isFinite(delta)) return;
    await adjust(target.dataset.track, delta);
  }

  /**
   * GM toggle for whether players can see the HUD at all.
   * @this {VictoryCounterOverlay}
   */
  static async onTogglePlayerVisibility() {
    if (!game.user.isGM) return;
    await togglePlayerVisibility();
  }

  /**
   * @this {VictoryCounterOverlay}
   */
  static async onUndoChange() {
    if (!game.user.isGM) return;
    await undo();
  }

  /* ---------------------------------------- */
  /*  Singleton management                    */
  /* ---------------------------------------- */

  /** @type {VictoryCounterOverlay|null} */
  static #instance = null;

  /**
   * Whether the HUD should currently be on screen for this user.
   * @returns {boolean}
   */
  static shouldDisplay() {
    if (game.settings.get(MODULE_ID, SETTINGS.OVERLAY_HIDDEN) === true) return false;
    return canUserSee();
  }

  /**
   * Render, re-render or close the HUD to match the current state.
   * Safe to call repeatedly; it never creates a second instance.
   * @returns {Promise<void>}
   */
  static async refresh() {
    const shouldShow = this.shouldDisplay();
    const instance = this.#instance;

    if (!shouldShow) {
      if (instance?.rendered) await instance.close();
      return;
    }
    if (instance) {
      await instance.render({ force: true });
      return;
    }
    this.#instance = new VictoryCounterOverlay();
    await this.#instance.render({ force: true });
  }

  /**
   * Un-hide the HUD for this user and render it.
   * @returns {Promise<void>}
   */
  static async reveal() {
    await game.settings.set(MODULE_ID, SETTINGS.OVERLAY_HIDDEN, false);
    await this.refresh();
  }

  /**
   * Toggle this user's local visibility of the HUD.
   * @returns {Promise<void>}
   */
  static async toggleVisibility() {
    if (!canUserSee()) {
      ui.notifications.info(game.i18n.localize("PVC.Notify.NoChallenge"));
      return;
    }
    const hidden = game.settings.get(MODULE_ID, SETTINGS.OVERLAY_HIDDEN) === true;
    await game.settings.set(MODULE_ID, SETTINGS.OVERLAY_HIDDEN, !hidden);
    await this.refresh();
  }

  /**
   * Tear down the singleton.
   * @returns {Promise<void>}
   */
  static async teardown() {
    if (this.#instance?.rendered) await this.#instance.close();
    this.#instance = null;
  }
}
