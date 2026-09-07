/**
 * The step label editor: one window per track, listing its named steps as
 * editable rows.
 *
 * Its own window rather than more fields on the control panel's track card, for
 * the same reason the threshold editor is: ten rows of four fields inline would
 * make one card taller than the panel window and push every other track out of
 * view.
 *
 * Edits are held in a local draft and only written when the GM saves, so adding
 * or removing a row does not commit a half-typed list to the world — and a
 * mistake is one Cancel away rather than one Undo away.
 *
 * @module victory-counter/apps/step-editor
 */

import { LIMITS, MODULE_ID, clampInt, generateId } from "../constants.js";
import { getTrack, sanitizeSteps, setTrackSteps } from "../state.js";
import { readRungRows } from "./rung-draft.js";
import { clampToMinimum, refitToViewport } from "./window-fit.js";

const { ApplicationV2, DialogV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Minimum size for this window, shared by the CSS and by `setPosition`. */
const BOUNDS = {
  minWidth: LIMITS.MIN_EDITOR_WIDTH,
  minHeight: LIMITS.MIN_EDITOR_HEIGHT
};

export class StepEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: "pvc-step-editor",
    tag: "form",
    // `pvc-panel` and `pvc-threshold-editor` are both carried deliberately: this
    // is the same kind of window as the control panel and the same kind of list
    // as the ladder editor, and it wants both sets of styling. Reusing the
    // classes is what stops the two editors drifting apart visually; the
    // `pvc-step-editor` rules layer only the differences on top.
    classes: ["pvc", "pvc-panel", "pvc-threshold-editor", "pvc-step-editor"],
    window: {
      title: "PVC.Step.EditorTitle",
      icon: "fa-solid fa-list-check",
      resizable: true,
      minimizable: true
    },
    // A concrete height rather than "auto" is what gives the window a stable box
    // for its resize handle and lets the row list own its own scrolling; #refit
    // shrinks it when the display cannot fit this much.
    position: { width: 680, height: 600 },
    form: {
      // Saving is an explicit button; there is no native submit path.
      closeOnSubmit: false,
      submitOnChange: false
    },
    actions: {
      addRow: this.onAddRow,
      removeRow: this.onRemoveRow,
      saveSteps: this.onSave
    }
  };

  /** @override */
  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/step-editor.hbs` }
  };

  /**
   * @param {string} trackId Track whose step labels are being edited.
   * @param {object} [options]
   */
  constructor(trackId, options = {}) {
    super(options);
    this.trackId = trackId;
    /**
     * Working copy of the label list. Null until the first render seeds it from
     * the stored track.
     * @type {object[]|null}
     */
    this.draft = null;
  }

  /* ---------------------------------------- */

  /** @override */
  get title() {
    const track = getTrack(this.trackId);
    return game.i18n.format("PVC.Step.EditorTitleFor", {
      title: track?.title || game.i18n.localize("PVC.DefaultTitle")
    });
  }

  /** @override */
  async _prepareContext(_options) {
    const track = getTrack(this.trackId);
    if (!track) return { missing: true, limits: LIMITS };

    // Seed once from storage; afterwards the draft is the source of truth, so a
    // re-render caused by adding a row does not discard unsaved typing.
    if (!this.draft) this.draft = foundry.utils.deepClone(track.steps);

    // Sorted for display only. A countdown reads bottom-to-top, and sorting on
    // render (rather than on every keystroke) means rows never reshuffle under
    // the cursor mid-edit.
    //
    // No tone badge here, unlike the ladder editor: tone is measured against a
    // threshold track's `start`, which a step track does not have. What a GM
    // writing a countdown wants at a glance is whether the track has passed the
    // step yet, so that is what the row shows instead.
    const rows = [...this.draft]
      .sort((a, b) => Number(a.value) - Number(b.value))
      .map((row) => ({
        ...row,
        reached: Number(row.value) <= track.current,
        // A label above the target is kept rather than deleted — lowering a
        // target, even for a moment, must not throw away what the GM wrote — but
        // nothing draws or announces it while it is up there, so the row says so
        // and the GM can move it or drop it.
        beyond: Number(row.value) > track.target
      }));

    return {
      missing: false,
      track,
      rows,
      limits: LIMITS,
      atMax: rows.length >= LIMITS.MAX_STEP_LABELS,
      empty: rows.length === 0
    };
  }

  /* ---------------------------------------- */
  /*  Sizing                                  */
  /* ---------------------------------------- */

  /**
   * Enforce the minimum window size on every programmatic and drag-driven
   * resize, so the persisted position matches what CSS will actually render.
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
    // Adding or removing a label changes how tall the list wants to be. Refit so
    // the window stays on screen; the list scrolls inside it rather than the
    // window growing past the bottom of the monitor.
    this.#refit();
  }

  /**
   * Keep the window inside the viewport. Shared with the control panel and the
   * ladder editor, which grow the same way for the same reason — see
   * `window-fit.js`.
   */
  #refit() {
    refitToViewport(this, BOUNDS);
  }

  /* ---------------------------------------- */
  /*  Draft handling                          */
  /* ---------------------------------------- */

  /**
   * Read every row back out of the DOM into the draft.
   *
   * Called before any action that re-renders, so text typed but not yet saved
   * survives adding or removing a row. Shared with the ladder editor — see
   * `rung-draft.js`.
   */
  syncDraft() {
    this.draft = readRungRows(this.element);
  }

  /* ---------------------------------------- */
  /*  Actions                                 */
  /* ---------------------------------------- */

  /**
   * Append an empty label.
   *
   * The new label's step is one past the highest already present, which is what
   * a GM writing a countdown downward through the list is most likely to want,
   * and is clamped into the track's own range: step 0 is the empty track and can
   * never be reached, and a step past the target could never be reached either.
   *
   * @this {StepEditor}
   */
  static async onAddRow() {
    this.syncDraft();
    const track = getTrack(this.trackId);
    if (!track) return;

    if (this.draft.length >= LIMITS.MAX_STEP_LABELS) {
      ui.notifications.warn(
        game.i18n.format("PVC.Notify.MaxSteps", { max: LIMITS.MAX_STEP_LABELS })
      );
      return;
    }

    const highest = this.draft.reduce((max, row) => {
      const value = Number(row.value);
      return Number.isFinite(value) && value > max ? value : max;
    }, 0);

    this.draft.push({
      id: generateId(),
      value: clampInt(highest + 1, 1, track.target),
      label: "",
      description: "",
      announce: true
    });
    await this.render();
  }

  /**
   * @this {StepEditor}
   * @param {PointerEvent} event
   * @param {HTMLElement}  target
   */
  static async onRemoveRow(event, target) {
    this.syncDraft();
    this.draft = this.draft.filter((row) => row.id !== target.dataset.id);
    await this.render();
  }

  /**
   * Write the labels to the track and close.
   * @this {StepEditor}
   */
  static async onSave() {
    this.syncDraft();

    // Sanitizing here as well as in the state layer is not redundant: it is what
    // lets the confirmation below quote the list the GM is actually about to
    // get, duplicates dropped and rows sorted.
    const clean = sanitizeSteps(this.draft);
    const unnamed = clean.filter((row) => !row.label.trim()).length;

    if (unnamed) {
      const proceed = await DialogV2.confirm({
        window: { title: game.i18n.localize("PVC.Confirm.UnnamedStepsTitle") },
        content: `<p>${game.i18n.format("PVC.Confirm.UnnamedStepsContent", {
          count: unnamed
        })}</p>`,
        rejectClose: false,
        modal: true
      });
      if (!proceed) return;
    }

    const result = await setTrackSteps(this.trackId, this.draft);
    if (!result) return;

    this.draft = null;
    await this.close();
  }

  /* ---------------------------------------- */
  /*  Singleton management                    */
  /* ---------------------------------------- */

  /** @type {StepEditor|null} */
  static #instance = null;

  /**
   * Open the editor for one track, replacing any editor already open for a
   * different one so two label lists can never be edited against one draft.
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
    if (!this.#instance) this.#instance = new StepEditor(trackId);

    await this.#instance.render({ force: true });
    this.#instance.bringToFront?.();
  }

  /** @override */
  async close(options = {}) {
    if (StepEditor.#instance === this) StepEditor.#instance = null;
    return super.close(options);
  }

  /** @returns {Promise<void>} */
  static async teardown() {
    if (this.#instance?.rendered) await this.#instance.close();
    this.#instance = null;
  }
}
