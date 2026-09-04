/**
 * The threshold ladder editor: one window per track, listing its rungs as
 * editable rows.
 *
 * Why its own window rather than more fields on the control panel's track card:
 * a ladder is up to twelve rows of four fields each, and the panel already lays
 * its cards out in a reflowing grid sized for a card that fits on screen. Twelve
 * inline rows would make one card taller than the window and push every other
 * track out of view.
 *
 * Edits are held in a local draft and only written when the GM saves, so adding
 * or removing a row does not commit a half-typed ladder to the world — and a
 * mistake is one Cancel away rather than one Undo away.
 *
 * @module victory-counter/apps/threshold-editor
 */

import { LIMITS, MODULE_ID, bandTone, generateId } from "../constants.js";
import { getTrack, sanitizeThresholds, setTrackThresholds } from "../state.js";

const { ApplicationV2, DialogV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class ThresholdEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: "pvc-threshold-editor",
    tag: "form",
    classes: ["pvc", "pvc-threshold-editor"],
    window: {
      title: "PVC.Threshold.EditorTitle",
      icon: "fa-solid fa-layer-group",
      resizable: true,
      minimizable: true
    },
    position: { width: 680, height: 600 },
    form: {
      // Saving is an explicit button; there is no native submit path.
      closeOnSubmit: false,
      submitOnChange: false
    },
    actions: {
      addRow: this.onAddRow,
      removeRow: this.onRemoveRow,
      saveLadder: this.onSave
    }
  };

  /** @override */
  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/threshold-editor.hbs` }
  };

  /**
   * @param {string} trackId Track whose ladder is being edited.
   * @param {object} [options]
   */
  constructor(trackId, options = {}) {
    super(options);
    this.trackId = trackId;
    /**
     * Working copy of the ladder. Null until the first render seeds it from the
     * stored track.
     * @type {object[]|null}
     */
    this.draft = null;
  }

  /* ---------------------------------------- */

  /** @override */
  get title() {
    const track = getTrack(this.trackId);
    return game.i18n.format("PVC.Threshold.EditorTitleFor", {
      title: track?.title || game.i18n.localize("PVC.DefaultTitle")
    });
  }

  /** @override */
  async _prepareContext(_options) {
    const track = getTrack(this.trackId);
    if (!track) return { missing: true, limits: LIMITS };

    // Seed once from storage; afterwards the draft is the source of truth, so a
    // re-render caused by adding a row does not discard unsaved typing.
    if (!this.draft) this.draft = foundry.utils.deepClone(track.thresholds);

    // Sorted for display only. The GM reads a ladder bottom-to-top, and sorting
    // on render (rather than on every keystroke) means rows never reshuffle
    // under the cursor mid-edit.
    const rows = [...this.draft]
      .sort((a, b) => Number(a.value) - Number(b.value))
      .map((row) => {
        const tone = bandTone(row, track.start);
        return {
          ...row,
          tone,
          toneLabel: game.i18n.localize(`PVC.Tone.${tone}`)
        };
      });

    return {
      missing: false,
      track,
      rows,
      limits: LIMITS,
      atMax: rows.length >= LIMITS.MAX_THRESHOLDS,
      empty: rows.length === 0
    };
  }

  /* ---------------------------------------- */
  /*  Draft handling                          */
  /* ---------------------------------------- */

  /**
   * Read every row back out of the DOM into the draft.
   *
   * Called before any action that re-renders, so text typed but not yet saved
   * survives adding or removing a row.
   *
   * Fields are addressed with `data-field` rather than `name` so that twelve
   * rows of identically-named inputs never form an ambiguous form submission.
   */
  syncDraft() {
    const root = this.element;
    if (!root) return;

    this.draft = [...root.querySelectorAll("[data-threshold-row]")].map((row) => ({
      id: row.dataset.id,
      value: row.querySelector('[data-field="value"]')?.value,
      label: row.querySelector('[data-field="label"]')?.value,
      description: row.querySelector('[data-field="description"]')?.value,
      announce: row.querySelector('[data-field="announce"]')?.checked !== false
    }));
  }

  /* ---------------------------------------- */
  /*  Actions                                 */
  /* ---------------------------------------- */

  /**
   * Append an empty rung.
   *
   * The new rung's value is one past the highest already present, which is the
   * value a GM building a ladder upward is most likely to want and is always
   * inside the track's range unless the ladder already reaches its ceiling.
   *
   * @this {ThresholdEditor}
   */
  static async onAddRow() {
    this.syncDraft();
    const track = getTrack(this.trackId);
    if (!track) return;

    if (this.draft.length >= LIMITS.MAX_THRESHOLDS) {
      ui.notifications.warn(
        game.i18n.format("PVC.Notify.MaxThresholds", { max: LIMITS.MAX_THRESHOLDS })
      );
      return;
    }

    const highest = this.draft.reduce((max, row) => {
      const value = Number(row.value);
      return Number.isFinite(value) && value > max ? value : max;
    }, Number.NEGATIVE_INFINITY);

    const next = Number.isFinite(highest)
      ? Math.min(highest + 1, track.max)
      : track.start;

    this.draft.push({
      id: generateId(),
      value: next,
      label: "",
      description: "",
      announce: true
    });
    await this.render();
  }

  /**
   * @this {ThresholdEditor}
   * @param {PointerEvent} event
   * @param {HTMLElement}  target
   */
  static async onRemoveRow(event, target) {
    this.syncDraft();
    this.draft = this.draft.filter((row) => row.id !== target.dataset.id);
    await this.render();
  }

  /**
   * Write the ladder to the track and close.
   * @this {ThresholdEditor}
   */
  static async onSave() {
    this.syncDraft();

    // Sanitizing here as well as in the state layer is not redundant: it is what
    // lets the confirmation below quote the ladder the GM is actually about to
    // get, duplicates dropped and rungs sorted.
    const clean = sanitizeThresholds(this.draft);
    const unnamed = clean.filter((row) => !row.label.trim()).length;

    if (unnamed) {
      const proceed = await DialogV2.confirm({
        window: { title: game.i18n.localize("PVC.Confirm.UnnamedBandsTitle") },
        content: `<p>${game.i18n.format("PVC.Confirm.UnnamedBandsContent", {
          count: unnamed
        })}</p>`,
        rejectClose: false,
        modal: true
      });
      if (!proceed) return;
    }

    const result = await setTrackThresholds(this.trackId, this.draft);
    if (!result) return;

    this.draft = null;
    await this.close();
  }

  /* ---------------------------------------- */
  /*  Singleton management                    */
  /* ---------------------------------------- */

  /** @type {ThresholdEditor|null} */
  static #instance = null;

  /**
   * Open the editor for one track, replacing any editor already open for a
   * different one so two ladders can never be edited against one draft.
   * @param {string} trackId
   * @returns {Promise<void>}
   */
  static async open(trackId) {
    if (!game.user.isGM) {
      ui.notifications.warn(game.i18n.localize("PVC.Notify.GMOnly"));
      return;
    }
    if (!getTrack(trackId)) {
      ui.notifications.warn(game.i18n.localize("PVC.Notify.NoTrack"));
      return;
    }

    if (this.#instance && this.#instance.trackId !== trackId) {
      await this.#instance.close();
      this.#instance = null;
    }
    if (!this.#instance) this.#instance = new ThresholdEditor(trackId);

    await this.#instance.render({ force: true });
    this.#instance.bringToFront?.();
  }

  /** @override */
  async close(options = {}) {
    if (ThresholdEditor.#instance === this) ThresholdEditor.#instance = null;
    return super.close(options);
  }

  /** @returns {Promise<void>} */
  static async teardown() {
    if (this.#instance?.rendered) await this.#instance.close();
    this.#instance = null;
  }
}
