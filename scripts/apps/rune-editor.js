/**
 * The rune editor: one window per track, listing the seats of its circle as
 * editable rows.
 *
 * Its own window rather than more fields on the control panel's track card, for
 * the reason the ladder editor gives: a circle can have 24 seats, and 24 inline
 * rows would make one card taller than the panel and push every other track out
 * of view.
 *
 * Every seat gets a row, but only the ones the GM actually fills in are stored —
 * `sanitizeRunes` drops a row that names neither a glyph nor a label, so a
 * circle the GM merely looked at does not grow an array of blanks. That is also
 * why the defaults are placeholders rather than values: clearing a field means
 * "give me the default back", and it can only mean that if the default was
 * never in the field to begin with.
 *
 * Edits are held in a local draft and only written on save, matching the ladder
 * editor, so a mistake is one Cancel away rather than one Undo away.
 *
 * @module victory-counter/apps/rune-editor
 */

import { LIMITS, MODULE_ID } from "../constants.js";
import { getTrack, setTrackRunes } from "../state.js";
import { runeSeatCount, runeSeatOutline, usesRuneCircle } from "../rune-view.js";
import { trackDisplayName } from "../track-view.js";
import { clampToMinimum, refitToViewport } from "./window-fit.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Minimum size for this window, shared by the CSS and by `setPosition`. */
const BOUNDS = {
  minWidth: LIMITS.MIN_RUNE_EDITOR_WIDTH,
  minHeight: LIMITS.MIN_RUNE_EDITOR_HEIGHT
};

export class RuneEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: "pvc-rune-editor",
    tag: "form",
    // `pvc-panel` is carried for the same reason the ladder editor carries it:
    // this is the same kind of window and wants the same fieldset, label, input
    // and button styling, so the two cannot drift apart visually.
    classes: ["pvc", "pvc-panel", "pvc-rune-editor"],
    window: {
      title: "PVC.Circle.EditorTitle",
      icon: "fa-solid fa-wand-magic-sparkles",
      resizable: true,
      minimizable: true
    },
    position: { width: 520, height: 600 },
    form: {
      closeOnSubmit: false,
      submitOnChange: false
    },
    actions: {
      clearRunes: this.onClear,
      saveRunes: this.onSave
    }
  };

  /** @override */
  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/rune-editor.hbs` }
  };

  /**
   * @param {string} trackId Track whose runes are being edited.
   * @param {object} [options]
   */
  constructor(trackId, options = {}) {
    super(options);
    this.trackId = trackId;
    /**
     * Working copy, keyed by seat key. Null until the first render seeds it.
     * @type {Map<string, {glyph: string, label: string}>|null}
     */
    this.draft = null;
  }

  /* ---------------------------------------- */

  /** @override */
  get title() {
    const track = getTrack(this.trackId);
    return game.i18n.format("PVC.Circle.EditorTitleFor", {
      title: trackDisplayName(track)
    });
  }

  /** @override */
  async _prepareContext(_options) {
    const track = getTrack(this.trackId);
    if (!track) return { missing: true, limits: LIMITS };

    // Seed once from storage; afterwards the draft is the source of truth, so a
    // re-render does not discard unsaved typing.
    if (!this.draft) {
      this.draft = new Map(
        track.runes.map((rune) => [rune.key, { glyph: rune.glyph, label: rune.label }])
      );
    }

    // The seats come from the track, never from the draft: the ladder or the
    // target may have moved since the overrides were written, and the editor
    // has to show the circle as it stands now. Overrides for seats that no
    // longer exist stay in the draft untouched and are written back on save.
    const rows = runeSeatOutline(track).map((seat) => {
      const edit = this.draft.get(seat.key);
      return {
        ...seat,
        glyph: edit?.glyph ?? "",
        label: edit?.label ?? ""
      };
    });

    const seatTotal = runeSeatCount(track);

    return {
      missing: false,
      track,
      rows,
      limits: LIMITS,
      empty: rows.length === 0,
      // A track whose circle cannot currently be seated can still be edited —
      // the GM may be about to fix the target — but it is worth saying so.
      drawn: usesRuneCircle(track),
      // ...and when the reason it cannot be seated is that there are too many,
      // the list below is only the seats a circle could ever hold. Saying which
      // is the difference between a short list and a list that lost rows.
      // Compared here rather than in the template, which stays free of
      // arithmetic for the same reason the circle's geometry is computed in JS.
      truncated: seatTotal > rows.length,
      shown: rows.length,
      seatTotal
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
    // A full circle is 24 rows — taller than a laptop display. Refit so the
    // window stays on screen and the list scrolls inside it.
    this.#refit();
  }

  /** Shared with the control panel and the ladder editor — see `window-fit.js`. */
  #refit() {
    refitToViewport(this, BOUNDS);
  }

  /* ---------------------------------------- */
  /*  Draft handling                          */
  /* ---------------------------------------- */

  /**
   * Read every row back out of the DOM into the draft.
   *
   * Rows are merged into the existing draft rather than replacing it, which is
   * what preserves overrides belonging to seats this circle no longer has: they
   * were never on screen to be read back, and dropping them would delete a
   * glyph the GM cannot see and did not touch.
   *
   * Fields are addressed with `data-field` rather than `name` so that two dozen
   * rows of identically-named inputs never form an ambiguous submission.
   */
  syncDraft() {
    const root = this.element;
    if (!root || !this.draft) return;

    for (const row of root.querySelectorAll("[data-rune-row]")) {
      this.draft.set(row.dataset.key, {
        glyph: row.querySelector('[data-field="glyph"]')?.value ?? "",
        label: row.querySelector('[data-field="label"]')?.value ?? ""
      });
    }
  }

  /* ---------------------------------------- */
  /*  Actions                                 */
  /* ---------------------------------------- */

  /**
   * Empty every field on screen, returning the visible seats to their default
   * staves. Seats not on screen keep whatever they had, matching `syncDraft`.
   * @this {RuneEditor}
   */
  static async onClear() {
    const root = this.element;
    if (!root) return;
    for (const input of root.querySelectorAll("[data-rune-row] input")) input.value = "";
    this.syncDraft();
    await this.render();
  }

  /**
   * Write the overrides to the track and close.
   * @this {RuneEditor}
   */
  static async onSave() {
    this.syncDraft();

    const runes = [...this.draft.entries()].map(([key, edit]) => ({ key, ...edit }));
    const result = await setTrackRunes(this.trackId, runes);
    if (!result) return;

    this.draft = null;
    await this.close();
  }

  /* ---------------------------------------- */
  /*  Singleton management                    */
  /* ---------------------------------------- */

  /** @type {RuneEditor|null} */
  static #instance = null;

  /**
   * Open the editor for one track, replacing any editor already open for a
   * different one so two circles can never be edited against one draft.
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
    if (!this.#instance) this.#instance = new RuneEditor(trackId);

    await this.#instance.render({ force: true });
    this.#instance.bringToFront?.();
  }

  /** @override */
  async close(options = {}) {
    if (RuneEditor.#instance === this) RuneEditor.#instance = null;
    return super.close(options);
  }

  /** @returns {Promise<void>} */
  static async teardown() {
    if (this.#instance?.rendered) await this.#instance.close();
    this.#instance = null;
  }
}
