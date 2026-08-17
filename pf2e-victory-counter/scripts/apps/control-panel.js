/**
 * The GM control panel: initialize a challenge, configure thresholds, and
 * adjust progress. Never rendered for non-GM users.
 *
 * @module pf2e-victory-counter/apps/control-panel
 */

import { LIMITS, MODULE_ID, STATUS, clampInt } from "../constants.js";
import {
  adjust,
  clearChallenge,
  getChallenge,
  hasUndo,
  resetCounts,
  startChallenge,
  undo,
  updateConfig
} from "../state.js";

const { ApplicationV2, DialogV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class VictoryCounterPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: "pvc-control-panel",
    tag: "form",
    classes: ["pvc", "pvc-panel"],
    window: {
      title: "PVC.Panel.Title",
      icon: "fa-solid fa-trophy",
      resizable: false
    },
    position: { width: 420 },
    form: {
      // All mutations go through explicit buttons, so there is no submit path.
      closeOnSubmit: false,
      submitOnChange: false
    },
    actions: {
      startChallenge: this.onStart,
      applyConfig: this.onApply,
      adjustTrack: this.onAdjust,
      resetCounts: this.onReset,
      undoChange: this.onUndo,
      endChallenge: this.onEnd
    }
  };

  /** @override */
  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/control-panel.hbs` }
  };

  /* ---------------------------------------- */

  /** @override */
  async _prepareContext(_options) {
    const challenge = getChallenge();
    return {
      challenge,
      canUndo: hasUndo(),
      resolved: challenge.status !== STATUS.RUNNING,
      statusLabel: game.i18n.localize(`PVC.Status.${challenge.status}`),
      limits: LIMITS
    };
  }

  /**
   * Read the configuration fields currently entered in the panel.
   * Values are clamped here as well as in the state layer.
   * @returns {{title: string, requiredSuccesses: number, requiredFailures: number,
   *           trackFailures: boolean, visibleToPlayers: boolean}}
   */
  readForm() {
    const root = this.element;
    const field = (name) => root.querySelector(`[name="${name}"]`);
    return {
      title: String(field("title")?.value ?? "").trim().slice(0, LIMITS.MAX_TITLE_LENGTH),
      requiredSuccesses: clampInt(
        field("requiredSuccesses")?.value,
        LIMITS.MIN_REQUIRED,
        LIMITS.MAX_REQUIRED
      ),
      requiredFailures: clampInt(
        field("requiredFailures")?.value,
        LIMITS.MIN_REQUIRED,
        LIMITS.MAX_REQUIRED
      ),
      trackFailures: field("trackFailures")?.checked === true,
      visibleToPlayers: field("visibleToPlayers")?.checked === true
    };
  }

  /* ---------------------------------------- */
  /*  Actions                                 */
  /* ---------------------------------------- */

  /**
   * Start a new challenge. Requires explicit confirmation when this would
   * discard a challenge that is already running.
   * @this {VictoryCounterPanel}
   */
  static async onStart() {
    const current = getChallenge();
    const config = this.readForm();

    if (current.active) {
      const proceed = await DialogV2.confirm({
        window: { title: game.i18n.localize("PVC.Confirm.RestartTitle") },
        content: `<p>${game.i18n.format("PVC.Confirm.RestartContent", {
          title: current.title || game.i18n.localize("PVC.DefaultTitle"),
          successes: current.successes,
          failures: current.failures
        })}</p>`,
        rejectClose: false,
        modal: true
      });
      if (!proceed) return;
    }

    await startChallenge(config);
    await this.render();
  }

  /**
   * Apply configuration changes to the running challenge without touching counts.
   * @this {VictoryCounterPanel}
   */
  static async onApply() {
    const result = await updateConfig(this.readForm());
    if (result) ui.notifications.info(game.i18n.localize("PVC.Notify.ConfigApplied"));
    await this.render();
  }

  /**
   * @this {VictoryCounterPanel}
   * @param {PointerEvent} event
   * @param {HTMLElement}  target
   */
  static async onAdjust(event, target) {
    const track = target.dataset.track;
    const delta = Number(target.dataset.delta);
    if (!Number.isFinite(delta)) return;
    await adjust(track, delta);
    await this.render();
  }

  /**
   * @this {VictoryCounterPanel}
   */
  static async onReset() {
    const proceed = await DialogV2.confirm({
      window: { title: game.i18n.localize("PVC.Confirm.ResetTitle") },
      content: `<p>${game.i18n.localize("PVC.Confirm.ResetContent")}</p>`,
      rejectClose: false,
      modal: true
    });
    if (!proceed) return;
    await resetCounts();
    await this.render();
  }

  /**
   * @this {VictoryCounterPanel}
   */
  static async onUndo() {
    await undo();
    await this.render();
  }

  /**
   * End the challenge and remove the counter from every screen.
   * @this {VictoryCounterPanel}
   */
  static async onEnd() {
    const current = getChallenge();
    const proceed = await DialogV2.confirm({
      window: { title: game.i18n.localize("PVC.Confirm.EndTitle") },
      content: `<p>${game.i18n.format("PVC.Confirm.EndContent", {
        title: current.title || game.i18n.localize("PVC.DefaultTitle")
      })}</p><p class="notes">${game.i18n.localize("PVC.Confirm.EndNote")}</p>`,
      rejectClose: false,
      modal: true
    });
    if (!proceed) return;
    await clearChallenge();
    await this.render();
  }

  /* ---------------------------------------- */
  /*  Singleton management                    */
  /* ---------------------------------------- */

  /** @type {VictoryCounterPanel|null} */
  static #instance = null;

  /**
   * Open the panel, or bring the existing one to the front.
   * @returns {Promise<void>}
   */
  static async show() {
    if (!game.user.isGM) {
      ui.notifications.warn(game.i18n.localize("PVC.Notify.GMOnly"));
      return;
    }
    if (!this.#instance) this.#instance = new VictoryCounterPanel();
    await this.#instance.render({ force: true });
    this.#instance.bringToFront?.();
  }

  /**
   * Close the panel if it is open.
   * @returns {Promise<void>}
   */
  static async hide() {
    if (this.#instance?.rendered) await this.#instance.close();
  }

  /**
   * Toggle the panel open/closed.
   * @returns {Promise<void>}
   */
  static async toggle() {
    if (this.#instance?.rendered) await this.hide();
    else await this.show();
  }

  /**
   * Re-render the panel if it is currently open, so that GM screens stay in
   * sync when state is changed from the overlay or the API.
   * @returns {Promise<void>}
   */
  static async refresh() {
    if (this.#instance?.rendered) await this.#instance.render();
  }

  /** @returns {Promise<void>} */
  static async teardown() {
    await this.hide();
    this.#instance = null;
  }
}
