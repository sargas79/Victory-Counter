/**
 * The GM control panel: create tracks, configure thresholds, and adjust
 * progress for each one. Never rendered for non-GM users.
 *
 * @module pf2e-victory-counter/apps/control-panel
 */

import { LIMITS, MODULE_ID, STATUS, clampInt } from "../constants.js";
import {
  adjustTrack,
  createTrack,
  getTracks,
  hasUndo,
  moveTrack,
  removeTrack,
  resetTrackCounts,
  toggleTrackVisibility,
  undo,
  updateTrackConfig
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
      resizable: true
    },
    position: { width: 460, height: "auto" },
    form: {
      // All mutations go through explicit buttons, so there is no submit path.
      closeOnSubmit: false,
      submitOnChange: false
    },
    actions: {
      addTrack: this.onAddTrack,
      applyConfig: this.onApplyConfig,
      adjustTrack: this.onAdjust,
      resetCounts: this.onReset,
      removeTrack: this.onRemove,
      toggleVisibility: this.onToggleVisibility,
      moveTrack: this.onMove,
      undoChange: this.onUndo
    }
  };

  /** @override */
  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/control-panel.hbs` }
  };

  /* ---------------------------------------- */

  /** @override */
  async _prepareContext(_options) {
    const tracks = getTracks().map((track) => ({
      ...track,
      statusLabel: game.i18n.localize(`PVC.Status.${track.status}`),
      resolved: track.status !== STATUS.RUNNING
    }));
    return {
      tracks,
      atMax: tracks.length >= LIMITS.MAX_TRACKS,
      canUndo: hasUndo(),
      limits: LIMITS
    };
  }

  /**
   * Read the "add track" configuration fields.
   * @returns {{title: string, requiredSuccesses: number, requiredFailures: number,
   *           trackFailures: boolean, visibleToPlayers: boolean}}
   */
  readNewTrackForm() {
    const root = this.element;
    const field = (name) => root.querySelector(`[name="${name}"]`);
    return {
      title: String(field("new-title")?.value ?? "").trim().slice(0, LIMITS.MAX_TITLE_LENGTH),
      requiredSuccesses: clampInt(
        field("new-requiredSuccesses")?.value,
        LIMITS.MIN_REQUIRED,
        LIMITS.MAX_REQUIRED
      ),
      requiredFailures: clampInt(
        field("new-requiredFailures")?.value,
        LIMITS.MIN_REQUIRED,
        LIMITS.MAX_REQUIRED
      ),
      trackFailures: field("new-trackFailures")?.checked === true,
      visibleToPlayers: field("new-visibleToPlayers")?.checked === true
    };
  }

  /**
   * Read the configuration fields for an existing track's row.
   * @param {string} id
   * @returns {{title: string, requiredSuccesses: number, requiredFailures: number,
   *           trackFailures: boolean, visibleToPlayers: boolean}}
   */
  readTrackForm(id) {
    const root = this.element;
    const field = (name) => root.querySelector(`[name="${name}-${id}"]`);
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
   * Create a new track from the "add track" fieldset.
   * @this {VictoryCounterPanel}
   */
  static async onAddTrack() {
    const config = this.readNewTrackForm();
    const result = await createTrack(config);
    if (result) await this.render();
  }

  /**
   * Apply configuration changes to an existing track without touching counts.
   * @this {VictoryCounterPanel}
   * @param {PointerEvent} event
   * @param {HTMLElement}  target
   */
  static async onApplyConfig(event, target) {
    const id = target.dataset.id;
    const result = await updateTrackConfig(id, this.readTrackForm(id));
    if (result) ui.notifications.info(game.i18n.localize("PVC.Notify.ConfigApplied"));
    await this.render();
  }

  /**
   * @this {VictoryCounterPanel}
   * @param {PointerEvent} event
   * @param {HTMLElement}  target
   */
  static async onAdjust(event, target) {
    const id = target.dataset.id;
    const key = target.dataset.track;
    const delta = Number(target.dataset.delta);
    if (!Number.isFinite(delta)) return;
    await adjustTrack(id, key, delta);
    await this.render();
  }

  /**
   * @this {VictoryCounterPanel}
   * @param {PointerEvent} event
   * @param {HTMLElement}  target
   */
  static async onReset(event, target) {
    const proceed = await DialogV2.confirm({
      window: { title: game.i18n.localize("PVC.Confirm.ResetTitle") },
      content: `<p>${game.i18n.localize("PVC.Confirm.ResetContent")}</p>`,
      rejectClose: false,
      modal: true
    });
    if (!proceed) return;
    await resetTrackCounts(target.dataset.id);
    await this.render();
  }

  /**
   * @this {VictoryCounterPanel}
   * @param {PointerEvent} event
   * @param {HTMLElement}  target
   */
  static async onRemove(event, target) {
    const id = target.dataset.id;
    const current = getTracks().find((t) => t.id === id);
    const proceed = await DialogV2.confirm({
      window: { title: game.i18n.localize("PVC.Confirm.EndTitle") },
      content: `<p>${game.i18n.format("PVC.Confirm.EndContent", {
        title: current?.title || game.i18n.localize("PVC.DefaultTitle")
      })}</p><p class="notes">${game.i18n.localize("PVC.Confirm.EndNote")}</p>`,
      rejectClose: false,
      modal: true
    });
    if (!proceed) return;
    await removeTrack(id);
    await this.render();
  }

  /**
   * @this {VictoryCounterPanel}
   * @param {PointerEvent} event
   * @param {HTMLElement}  target
   */
  static async onToggleVisibility(event, target) {
    await toggleTrackVisibility(target.dataset.id);
    await this.render();
  }

  /**
   * @this {VictoryCounterPanel}
   * @param {PointerEvent} event
   * @param {HTMLElement}  target
   */
  static async onMove(event, target) {
    const direction = Number(target.dataset.direction);
    if (![-1, 1].includes(direction)) return;
    await moveTrack(target.dataset.id, direction);
    await this.render();
  }

  /**
   * @this {VictoryCounterPanel}
   */
  static async onUndo() {
    await undo();
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
