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
  TRACK_MODES,
  TRACK_TYPES,
  clampInt
} from "../constants.js";
import {
  adjustTrack,
  createTrack,
  getTracks,
  hasUndo,
  isThresholdTrack,
  moveTrack,
  removeTrack,
  resetTrackProgress,
  ringsEnabled,
  toggleThresholdAnnounce,
  toggleTrackAnnounce,
  toggleTrackVisibility,
  undo,
  updateTrackConfig
} from "../state.js";
import { trackCardBase } from "../track-view.js";
import { buildThresholdView } from "../threshold-view.js";
import { clampToMinimum, refitToViewport } from "./window-fit.js";

const { ApplicationV2, DialogV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Minimum size for this window, shared by the CSS and by `setPosition`. */
const BOUNDS = {
  minWidth: LIMITS.MIN_PANEL_WIDTH,
  minHeight: LIMITS.MIN_PANEL_HEIGHT
};

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
      toggleThresholdAnnounce: this.onToggleThresholdAnnounce,
      editThresholds: this.onEditThresholds,
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
      const threshold = isThresholdTrack(track);

      const base = {
        ...trackCardBase(track),
        announcing: track.postToChat !== false,
        // Shown on both modes so a GM who switched a track to progress can still
        // see that a ladder is waiting for it.
        thresholdCount: track.thresholds.length,
        announcingThresholds: track.announceThresholds !== false
      };

      if (!threshold) return { ...base, threshold: false };

      // The GM always sees the whole ladder; revealLadder only governs players.
      return { ...base, ...buildThresholdView(track, { showLadder: true }) };
    });

    return {
      tracks,
      rings,
      ring: RING,
      atMax: tracks.length >= LIMITS.MAX_TRACKS,
      canUndo: hasUndo(),
      limits: LIMITS,
      defaults: {
        // Seeds the "add track" fields. Mirrors the worked example in the README
        // (start 6 inside a 0-12 range) so a first threshold track is usable
        // before the GM has opened the ladder editor.
        start: 6,
        min: 0,
        max: 12
      },
      modes: [
        {
          value: TRACK_MODES.PROGRESS,
          label: game.i18n.localize("PVC.Mode.Progress")
        },
        {
          value: TRACK_MODES.THRESHOLD,
          label: game.i18n.localize("PVC.Mode.Threshold")
        }
      ],
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
   * The mode/bound fields shared by the "add track" form and each track card.
   *
   * `min` and `max` are read before `start` but not clamped against each other
   * here: sanitization owns that ordering, and doing it twice would let the two
   * disagree about which field wins.
   *
   * @param {(name: string) => HTMLElement|null} field Field lookup for this form.
   * @returns {{mode: string, start: number, min: number, max: number}}
   */
  static readModeFields(field) {
    const mode = field("mode")?.value;
    return {
      mode: Object.values(TRACK_MODES).includes(mode) ? mode : TRACK_MODES.PROGRESS,
      start: clampInt(field("start")?.value, LIMITS.MIN_VALUE, LIMITS.MAX_VALUE),
      min: clampInt(field("min")?.value, LIMITS.MIN_VALUE, LIMITS.MAX_VALUE),
      max: clampInt(field("max")?.value, LIMITS.MIN_VALUE, LIMITS.MAX_VALUE)
    };
  }

  /**
   * Read the "add track" configuration fields.
   * Announcing in chat is deliberately not part of this form: it is a running
   * toggle on the track card, changeable at any time. The same is true of the
   * threshold ladder, which is written in its own editor.
   * @returns {object}
   */
  readNewTrackForm() {
    const root = this.element;
    const field = (name) => root.querySelector(`[name="new-${name}"]`);
    const type = field("type")?.value;
    return {
      title: String(field("title")?.value ?? "").trim().slice(0, LIMITS.MAX_TITLE_LENGTH),
      target: clampInt(field("target")?.value, LIMITS.MIN_TARGET, LIMITS.MAX_TARGET),
      type: Object.values(TRACK_TYPES).includes(type) ? type : TRACK_TYPES.POSITIVE,
      visibleToPlayers: field("visibleToPlayers")?.checked === true,
      revealLadder: field("revealLadder")?.checked === true,
      ...VictoryCounterPanel.readModeFields(field)
    };
  }

  /**
   * Read the configuration fields for an existing track's card.
   *
   * `postToChat`, `announceThresholds` and `thresholds` are all left out on
   * purpose: the first two have their own immediate toggles and the third has
   * its own editor, so applying other config changes must never overwrite them.
   *
   * @param {string} id
   * @returns {object}
   */
  readTrackForm(id) {
    const root = this.element;
    const field = (name) => root.querySelector(`[name="${name}-${id}"]`);
    const type = field("type")?.value;
    return {
      title: String(field("title")?.value ?? "").trim().slice(0, LIMITS.MAX_TITLE_LENGTH),
      target: clampInt(field("target")?.value, LIMITS.MIN_TARGET, LIMITS.MAX_TARGET),
      type: Object.values(TRACK_TYPES).includes(type) ? type : TRACK_TYPES.POSITIVE,
      visibleToPlayers: field("visibleToPlayers")?.checked === true,
      revealLadder: field("revealLadder")?.checked === true,
      ...VictoryCounterPanel.readModeFields(field)
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
    return super.setPosition(clampToMinimum(position, BOUNDS));
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    this.#bindModeSwitches();
    // Adding or removing a track changes the natural height of the grid; refit
    // so the window uses the space it needs and no more.
    this.#refit();
  }

  /**
   * Show only the fields that belong to the currently selected mode.
   *
   * Target is meaningless on a threshold track and start/min/max are meaningless
   * on a progress one, so leaving both sets on screen would invite the GM to
   * fill in fields that are then silently ignored. The swap is a data attribute
   * plus CSS rather than a re-render, so it happens instantly and does not
   * discard anything else already typed into the form.
   */
  #bindModeSwitches() {
    const root = this.element;
    if (!root) return;

    for (const select of root.querySelectorAll("[data-mode-select]")) {
      const scope = select.closest("[data-mode-scope]");
      if (!scope) continue;
      select.addEventListener("change", () => {
        scope.dataset.mode = select.value;
      });
    }
  }

  /**
   * Keep the window inside the viewport after tracks are added or removed.
   * Shared with the threshold editor, which grows the same way for the same
   * reason — see `window-fit.js`.
   */
  #refit() {
    refitToViewport(this, BOUNDS);
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
    const id = target.dataset.id;
    const track = getTracks().find((t) => t.id === id);
    // "Back to zero" would be a lie for a threshold track, which returns to the
    // starting value the GM chose — worth naming, since that value is what the
    // whole ladder is measured against.
    const threshold = isThresholdTrack(track);

    const proceed = await DialogV2.confirm({
      window: { title: game.i18n.localize("PVC.Confirm.ResetTitle") },
      content: `<p>${
        threshold
          ? game.i18n.format("PVC.Confirm.ResetToStartContent", { value: track.start })
          : game.i18n.localize("PVC.Confirm.ResetContent")
      }</p>`,
      rejectClose: false,
      modal: true
    });
    if (!proceed) return;
    await resetTrackProgress(id);
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
   * Turn this track's band-change announcements on or off. Independent of the
   * value-change toggle above: a GM commonly wants silence on every point but a
   * card the moment the situation crosses into a new band.
   * @this {VictoryCounterPanel}
   * @param {PointerEvent} event
   * @param {HTMLElement}  target
   */
  static async onToggleThresholdAnnounce(event, target) {
    await toggleThresholdAnnounce(target.dataset.id);
    await this.render();
  }

  /**
   * Open the ladder editor for this track.
   *
   * Imported on demand for the same reason `hooks.js` loads the applications
   * lazily: an editor that fails to parse must cost the GM the ladder editor,
   * not the whole control panel.
   *
   * @this {VictoryCounterPanel}
   * @param {PointerEvent} event
   * @param {HTMLElement}  target
   */
  static async onEditThresholds(event, target) {
    const id = target.dataset.id;
    try {
      const { ThresholdEditor } = await import("./threshold-editor.js");
      await ThresholdEditor.open(id);
    } catch (err) {
      console.error(`[${MODULE_ID}] The threshold editor could not be loaded.`, err);
      ui.notifications.error(game.i18n.localize("PVC.Notify.UILoadFailed"));
    }
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
