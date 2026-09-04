/**
 * Keeping an ApplicationV2 window inside the screen it is drawn on.
 *
 * Two windows in this module need identical behaviour — the GM control panel
 * and the threshold ladder editor — because both grow with their content: one
 * with the number of tracks, the other with the number of rungs. A window that
 * sizes itself to its content will happily grow past the bottom of the display,
 * taking its resize handle and its Save button with it.
 *
 * Shared rather than copied so the two cannot drift: a fix to how one of them
 * handles a small screen is a fix to both.
 *
 * @module victory-counter/apps/window-fit
 */

/** Space left between the window and the viewport edge when refitting. */
export const VIEWPORT_MARGIN = 60;

/**
 * Clamp a position to a minimum size.
 *
 * CSS `min-width`/`min-height` already stop the *rendered* box from going
 * smaller, because the browser honours them over the inline width ApplicationV2
 * writes during a drag. This keeps the persisted position honest as well, so a
 * window reopened later does not come back at a size it never actually had.
 *
 * @param {object} position
 * @param {{minWidth: number, minHeight: number}} bounds
 * @returns {object} A copy of the position, clamped.
 */
export function clampToMinimum(position = {}, { minWidth, minHeight }) {
  const next = { ...position };
  if (typeof next.width === "number") next.width = Math.max(minWidth, next.width);
  if (typeof next.height === "number") next.height = Math.max(minHeight, next.height);
  return next;
}

/**
 * Shrink a window that no longer fits the viewport, and pull one that is partly
 * off screen back onto it.
 *
 * Only ever shrinks: a GM who has sized a window down keeps that size. The
 * pull-back matters because a window left partly off screen by a previous
 * session — or by a smaller monitor — puts its bottom-right resize handle out
 * of reach, and there is no other way to get it back.
 *
 * @param {object} app An ApplicationV2 instance with `element` and `position`.
 * @param {{minWidth: number, minHeight: number}} bounds
 * @returns {void}
 */
export function refitToViewport(app, { minWidth, minHeight }) {
  if (!app?.element) return;

  const maxHeight = Math.max(minHeight, window.innerHeight - VIEWPORT_MARGIN);
  const maxWidth = Math.max(minWidth, window.innerWidth - VIEWPORT_MARGIN);
  const update = {};

  const height = Number(app.position.height);
  if (Number.isFinite(height) && height > maxHeight) update.height = maxHeight;

  const width = Number(app.position.width);
  if (Number.isFinite(width) && width > maxWidth) update.width = maxWidth;

  const top = Number(app.position.top);
  const left = Number(app.position.left);
  const effectiveHeight = update.height ?? height;
  const effectiveWidth = update.width ?? width;
  if (Number.isFinite(top) && top + effectiveHeight > window.innerHeight) {
    update.top = Math.max(0, window.innerHeight - effectiveHeight);
  }
  if (Number.isFinite(left) && left + effectiveWidth > window.innerWidth) {
    update.left = Math.max(0, window.innerWidth - effectiveWidth);
  }

  if (Object.keys(update).length) app.setPosition(update);
}
