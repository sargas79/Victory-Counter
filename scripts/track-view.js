/**
 * Presentation helpers shared by every track card.
 *
 * The HUD and the GM control panel draw the same track from the same stored
 * fields: the same polarity badge, the same status word, the same ring geometry,
 * the same accessible name. Both used to derive that independently, and the two
 * had already drifted — the panel never built `progressLabel`, so the progress
 * ring it shares with the HUD rendered `role="img"` with an empty accessible
 * name for every progress track.
 *
 * {@link module:victory-counter/threshold-view} makes the same argument for the
 * threshold half and states it plainly: deriving a thing in several places is
 * how those places drift apart. This module is that rule applied to the half
 * that had not yet been given it.
 *
 * Pure view-model construction: nothing here reads or writes stored state, and
 * nothing decides *whether* a card is shown, only how it reads once the caller
 * has decided.
 *
 * @module victory-counter/track-view
 */

import { STATUS, TRACK_TYPES, progressPercent, ringDashOffset } from "./constants.js";

/**
 * A track's display name, falling back to the localized default.
 *
 * A track the GM never titled still has to call itself something, in the card
 * and in the screen-reader label alike — and both have to agree on what.
 *
 * @param {object} track A sanitized track.
 * @returns {string}
 */
export function trackDisplayName(track) {
  return track.title || game.i18n.localize("PVC.DefaultTitle");
}

/**
 * Build the half of a track's render context that every card shares.
 *
 * Callers spread the result and add what only their own window needs — the HUD
 * its formatted `lastChange`, the panel its announce/ladder affordances. The
 * fields returned here are the ones both templates read, plus the ones the
 * shared `progress-ring.hbs` partial reads, which is the set that has to stay
 * identical between the two windows.
 *
 * A threshold track then spreads {@link buildThresholdView} over this, which
 * deliberately replaces `progressLabel` with the band-shaped label: "4 of 12"
 * says nothing useful when the meaning lives in the band rather than in the
 * distance to a target.
 *
 * @param {object} track A sanitized track.
 * @returns {object} The track's own fields plus the shared derived ones.
 */
export function trackCardBase(track) {
  const percent = progressPercent(track.current, track.target);
  const negative = track.type === TRACK_TYPES.NEGATIVE;
  const displayTitle = trackDisplayName(track);
  const typeLabel = game.i18n.localize(negative ? "PVC.Type.Negative" : "PVC.Type.Positive");

  return {
    ...track,
    displayTitle,
    percent: Math.round(percent),
    ringOffset: ringDashOffset(percent),
    negative,
    typeLabel,
    typeTooltip: game.i18n.localize(
      negative ? "PVC.Type.NegativeHint" : "PVC.Type.PositiveHint"
    ),
    complete: track.status === STATUS.COMPLETE,
    statusLabel: game.i18n.localize(`PVC.Status.${track.status}`),
    // The ring is aria-hidden down to the digits, so this string is the entire
    // accessible name of the readout in both windows.
    progressLabel: game.i18n.format("PVC.Aria.Progress", {
      title: displayTitle,
      type: typeLabel,
      current: track.current,
      target: track.target
    })
  };
}
