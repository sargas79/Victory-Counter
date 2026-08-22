/**
 * The GM control panel: create tracks, configure name/target/polarity, and
 * adjust progress for each one. Never rendered for non-GM users.
 *
 * Layout notes (v14 ApplicationV2):
 * - The window is `resizable`, opens at a fixed size, and enforces a minimum
 *   through both CSS (`min-width`/`min-height`, which the browser honours over
 *   the inline width Foundry writes) and {@link VictoryCounterPanel#setPosition}.
 * - Track cards live in a CSS Grid that reflows by available width, so adding a
 *   fourth track widens the layout into columns rather than growing a scrollbar.
 * - After every render the window refits itself against the viewport, so the
 *   content area only scrolls when the window genuinely runs out of screen.
 *
 * @module victory-counter/apps/control-panel
 */

import {
  LIMITS,
  MODULE_ID,
  RING,
  STATUS,
  TRACK_TYPES,
  clampInt,
  progressPercent,
  ringDashOffset
} from "../constants.js";
import {
  adjustTrack,
  createTrack,
  getTracks,
  hasUndo,
  moveTrack,
  removeTrack,
  resetTrackProgress,
  ringsEnabled,
  toggleTrackAnnounce,
  toggleTrackVisibility,
  undo,
  updateTrackConfig
} from "../state.js";

const { ApplicationV2, DialogV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Space left between the window and the viewport edge when refitting. */
const VIEWPORT_MARGIN = 60;

export class VictoryCounterPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: "pvc-control-panel",
    tag: "form",
    classes: ["pvc", "pvc-panel"],
    window: {
      title: "PVC.Panel.Title",
      icon: "fa-solid fa-trophy",
      resizable: true,
      minimizable: true
    },
    // A concrete height (rather than "auto") is what gives ApplicationV2 a
    // stable box for the resize handle and lets the content area own its own
    // scrolling. #refit shrinks it when the viewport cannot fit this much.
    position: { width: 720, height: 660 },
    form: {
      // All mutations go through explicit buttons, so there is no submit path.
      closeOnSubmit: false,
      submitOnChange: false
    },
    actions: {
      addTrack: this.onAddTrack,
      applyConfig: this.onApplyConfig,
      adjustTrack: this.onAdjust,
      resetProgress: this.onReset,
      removeTrack: this.onRemove,
      toggleVisibility: this.onToggleVisibility,
      toggleAnnounce: this.onToggleAnnounce,
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
    const rings = ringsEnabled();
    const tracks = getTracks().map((track) => {
      const percent = progressPercent(track.current, track.target);
      const negative = track.type === TRACK_TYPES.NEGATIVE;
      return {
        ...track,
        statusLabel: game.i18n.localize(`PVC.Status.${track.status}`),
        complete: track.status === STATUS.COMPLETE,
        announcing: track.postToChat !== false,
        negative,
        typeLabel: game.i18n.localize(negative ? "PVC.Type.Negative" : "PVC.Type.Positive"),
        typeTooltip: game.i18n.localize(
          negative ? "PVC.Type.NegativeHint" : "PVC.Type.PositiveHint"
        ),
        percent: Math.round(percent),
        ringOffset: ringDashOffset(percent),
        displayTitle: track.title || game.i18n.localize("PVC.DefaultTitle")
      };
    });

    return {
      tracks,
      rings,
      ring: RING,
      atMax: tracks.length >= LIMITS.MAX_TRACKS,
      canUndo: hasUndo(),
      limits: LIMITS,
      types: [
        {
          value: TRACK_TYPES.POSITIVE,
          label: game.i18n.localize("PVC.Type.Positive")
        },
        {
          value: TRACK_TYPES.NEGATIVE,
          label: game.i18n.localize("PVC.Type.Negative")
        }
      ]
    };
  }

  /**
   * Read the "add track" configuration fields.
   * Announcing in chat is deliberately not part of this form: it is a running
   * toggle on the track card, changeable at any time.
   * @returns {{title: string, target: number, type: string, visibleToPlayers: boolean}}
   */
  readNewTrackForm() {
    const root = this.element;
    const field = (name) => root.querySelector(`[name="${name}"]`);
    const type = field("new-type")?.value;
    return {
      title: String(field("new-title")?.value ?? "").trim().slice(0, LIMITS.MAX_TITLE_LENGTH),
      target: clampInt(field("new-target")?.value, LIMITS.MIN_TARGET, LIMITS.MAX_TARGET),
      type: Object.values(TRACK_TYPES).includes(type) ? type : TRACK_TYPES.POSITIVE,
      visibleToPlayers: field("new-visibleToPlayers")?.checked === true
    };
  }

  /**
   * Read the configuration fields for an existing track's card. `postToChat`
   * is left out on purpose: it has its own immediate toggle, so applying other
   * config changes must never overwrite it.
   * @param {string} id
   * @returns {{title: string, target: number, type: string, visibleToPlayers: boolean}}
   */
  readTrackForm(id) {
    const root = this.element;
    const field = (name) => root.querySelector(`[name="${name}-${id}"]`);
    const type = field("type")?.value;
    return {
      title: String(field("title")?.value ?? "").trim().slice(0, LIMITS.MAX_TITLE_LENGTH),
      target: clampInt(field("target")?.value, LIMITS.MIN_TARGET, LIMITS.MAX_TARGET),
      type: Object.values(TRACK_TYPES).includes(type) ? type : TRACK_TYPES.POSITIVE,
      visibleToPlayers: field("visibleToPlayers")?.checked === true
    };
  }

  /* ---------------------------------------- */
  /*  Sizing                                  */
  /* ---------------------------------------- */

  /**
   * Enforce the minimum window size on every programmatic and drag-driven
   * resize. CSS `min-width`/`min-height` already stop the *rendered* box from
   * going smaller; clamping here keeps the persisted position honest too.
   * @override
   * @param {object} [position]
   * @returns {object}
   */
  setPosition(position = {}) {
    const next = { ...position };
    if (typeof next.width === "number") {
      next.width = Math.max(LIMITS.MIN_PANEL_WIDTH, next.width);
    }
    if (typeof next.height === "number") {
      next.height = Math.max(LIMITS.MIN_PANEL_HEIGHT, next.height);
    }
    return super.setPosition(next);
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    // Adding or removing a track changes the natural height of the grid; refit
    // so the window uses the space it needs and no more.
    this.#refit();
  }

  /**
   * Keep the window inside the viewport after tracks are added or removed.
   * Only ever shrinks the window, and only when it would otherwise overflow the
   * screen — a GM who has sized the window down keeps that size.
   */
  #refit() {
    const el = this.element;
    if (!el) return;

    const maxHeight = Math.max(LIMITS.MIN_PANEL_HEIGHT, window.innerHeight - VIEWPORT_MARGIN);
    const maxWidth = Math.max(LIMITS.MIN_PANEL_WIDTH, window.innerWidth - VIEWPORT_MARGIN);
    const update = {};

    const height = Number(this.position.height);
    if (Number.isFinite(height) && height > maxHeight) update.height = maxHeight;

    const width = Number(this.position.width);
    if (Number.isFinite(width) && width > maxWidth) update.width = maxWidth;

    // Pull the window back on screen if a previous session left it partly off,
    // which would otherwise put the bottom-right resize handle out of reach.
    const top = Number(this.position.top);
    const left = Number(this.position.left);
    const effectiveHeight = update.height ?? height;
    const effectiveWidth = update.width ?? width;
    if (Number.isFinite(top) && top + effectiveHeight > window.innerHeight) {
      update.top = Math.max(0, window.innerHeight - effectiveHeight);
    }
    if (Number.isFinite(left) && left + effectiveWidth > window.innerWidth) {
      update.left = Math.max(0, window.innerWidth - effectiveWidth);
    }

    if (Object.keys(update).length) this.setPosition(update);
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
   * Apply configuration changes to an existing track without touching progress.
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
    const delta = Number(target.dataset.delta);
    if (!Number.isFinite(delta)) return;
    await adjustTrack(id, delta);
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
    await resetTrackProgress(target.dataset.id);
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
   * Turn this track's chat announcements on or off. Applies immediately, at any
   * point in the track's life.
   * @this {VictoryCounterPanel}
   * @param {PointerEvent} event
   * @param {HTMLElement}  target
   */
  static async onToggleAnnounce(event, target) {
    await toggleTrackAnnounce(target.dataset.id);
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
