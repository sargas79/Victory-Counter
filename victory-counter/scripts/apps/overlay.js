/**
 * The shared progress HUD every user sees, listing every track the current user
 * is allowed to see as a reflowing grid of cards.
 *
 * Implemented as an ApplicationV2 with `window.frame = false` and
 * `window.positioned = false`, so Foundry renders the element but leaves
 * placement to CSS plus the drag handler below.
 *
 * Layout notes:
 * - The card collection is a CSS Grid (`auto-fill` + `minmax`), so the HUD
 *   reflows into one, two or three columns purely from its own width.
 * - The HUD's width is a per-user client setting, adjusted with the resize grip
 *   in the bottom-right corner. The grip lives outside the scrolling grid, so it
 *   stays reachable no matter how many tracks are open.
 * - The grid only scrolls once it actually runs out of viewport height.
 *
 * @module victory-counter/apps/overlay
 */

import {
  LIMITS,
  MODULE_ID,
  OVERLAY_POSITIONS,
  RING,
  SETTINGS,
  STATUS,
  TRACK_TYPES,
  clampInt,
  log,
  progressPercent,
  ringDashOffset
} from "../constants.js";
import {
  adjustTrack,
  getVisibleTracks,
  hasUndo,
  ringsEnabled,
  setTrackCurrent,
  toggleTrackVisibility,
  undo
} from "../state.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

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
      toggleTrackVisibility: this.onToggleTrackVisibility,
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
    const isGM = game.user.isGM;
    const collapsed = game.settings.get(MODULE_ID, SETTINGS.OVERLAY_COLLAPSED) === true;
    const rings = ringsEnabled();

    const tracks = getVisibleTracks().map((track) => {
      const percent = progressPercent(track.current, track.target);
      const negative = track.type === TRACK_TYPES.NEGATIVE;
      return {
        ...track,
        displayTitle: track.title || game.i18n.localize("PVC.DefaultTitle"),
        percent: Math.round(percent),
        ringOffset: ringDashOffset(percent),
        negative,
        typeLabel: game.i18n.localize(negative ? "PVC.Type.Negative" : "PVC.Type.Positive"),
        typeTooltip: game.i18n.localize(
          negative ? "PVC.Type.NegativeHint" : "PVC.Type.PositiveHint"
        ),
        progressLabel: game.i18n.format("PVC.Aria.Progress", {
          title: track.title || game.i18n.localize("PVC.DefaultTitle"),
          type: game.i18n.localize(negative ? "PVC.Type.Negative" : "PVC.Type.Positive"),
          current: track.current,
          target: track.target
        }),
        complete: track.status === STATUS.COMPLETE,
        statusLabel: game.i18n.localize(`PVC.Status.${track.status}`),
        lastChange: this.#formatLastChange(track)
      };
    });

    return {
      tracks,
      collapsed,
      isGM,
      rings,
      ring: RING,
      canUndo: hasUndo()
    };
  }

  /**
   * Format a track's footer log line, or null when nothing has been recorded yet.
   * @param {object} track
   * @returns {{label: string, time: string}|null}
   */
  #formatLastChange(track) {
    const change = track.lastChange;
    if (!change?.delta || !change.time) return null;
    return {
      label: change.delta > 0 ? `+${change.delta}` : String(change.delta),
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
    this.#bindResizeGrip(el);
    this.#bindSetInputs(el);
  }

  /**
   * Position and size the HUD: a free-drag offset wins if the user has moved it,
   * otherwise the chosen screen anchor applies. Offsets are clamped into the
   * viewport so a stale value can never strand the HUD off screen.
   * @param {HTMLElement} el
   */
  #applyPlacement(el) {
    const scale = Number(game.settings.get(MODULE_ID, SETTINGS.OVERLAY_SCALE)) || 1;
    el.style.setProperty("--pvc-scale", String(Math.min(1.6, Math.max(0.6, scale))));

    const width = clampInt(
      game.settings.get(MODULE_ID, SETTINGS.OVERLAY_WIDTH),
      LIMITS.MIN_OVERLAY_WIDTH,
      LIMITS.MAX_OVERLAY_WIDTH
    );
    el.style.setProperty("--pvc-width", `${width}px`);

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
    el.classList.toggle("pvc-collapsed", context.collapsed);
    el.classList.toggle("pvc-gm", context.isGM);
    el.classList.toggle("pvc-rings", context.rings);
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
   * Drag the bottom-right grip to widen or narrow the HUD, which is what makes
   * the card grid reflow between one, two and three columns. The width is a
   * per-user client setting; it never touches shared state.
   *
   * The grip is a sibling of the scrolling grid rather than a child, so it stays
   * on screen with any number of tracks. Keyboard users get the same range from
   * the "Counter Width" slider in the module settings.
   *
   * @param {HTMLElement} el
   */
  #bindResizeGrip(el) {
    const grip = el.querySelector("[data-resize-grip]");
    if (!grip) return;

    const apply = (value) => {
      const width = clampInt(value, LIMITS.MIN_OVERLAY_WIDTH, LIMITS.MAX_OVERLAY_WIDTH);
      el.style.setProperty("--pvc-width", `${width}px`);
      return width;
    };

    grip.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();

      const surface = el.querySelector(".pvc-panel-surface");
      const scale = Number(getComputedStyle(el).getPropertyValue("--pvc-scale")) || 1;
      const startX = event.clientX;
      const measured = surface ? surface.getBoundingClientRect().width / scale : NaN;
      const startWidth = Number.isFinite(measured) ? measured : LIMITS.MIN_OVERLAY_WIDTH;
      el.classList.add("pvc-resizing");

      let width = startWidth;
      const onMove = (moveEvent) => {
        width = apply(startWidth + (moveEvent.clientX - startX) / scale);
      };

      const onUp = async () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        el.classList.remove("pvc-resizing");
        await game.settings.set(MODULE_ID, SETTINGS.OVERLAY_WIDTH, width);
        log("Overlay resized", { width });
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      // `pointercancel` fires when the browser takes over the gesture (a touch
      // turning into a scroll, the pointer leaving the window). Without it the
      // move listener would leak and the width would never be persisted.
      window.addEventListener("pointercancel", onUp);
    });

    // Double-clicking the grip returns the HUD to the default width.
    grip.addEventListener("dblclick", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const width = apply(320);
      await game.settings.set(MODULE_ID, SETTINGS.OVERLAY_WIDTH, width);
    });
  }

  /**
   * Wire the GM "set" fields: type a number, press Enter, progress is set.
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

        await setTrackCurrent(input.dataset.id, value);
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
    await adjustTrack(target.dataset.id, delta);
  }

  /**
   * GM toggle for whether players can see a specific track.
   * @this {VictoryCounterOverlay}
   * @param {PointerEvent} event
   * @param {HTMLElement}  target
   */
  static async onToggleTrackVisibility(event, target) {
    if (!game.user.isGM) return;
    await toggleTrackVisibility(target.dataset.id);
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
    return getVisibleTracks().length > 0;
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
    if (getVisibleTracks().length === 0) {
      ui.notifications.info(game.i18n.localize("PVC.Notify.NoTrack"));
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
