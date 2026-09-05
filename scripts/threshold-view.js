/**
 * Presentation helpers for threshold tracks.
 *
 * The HUD, the GM control panel and the chat card all have to describe the same
 * ladder — where the value sits on it, which band owns that spot, and how that
 * band reads against the starting value. Deriving that in three places is how
 * the three drift apart, so it is derived once here.
 *
 * Pure view-model construction: nothing in this module reads or writes stored
 * state, and nothing decides *whether* something is shown, only how it looks
 * once the caller has decided.
 *
 * @module victory-counter/threshold-view
 */

import { bandTone, ladderPercent, resolveBand } from "./constants.js";
import { trackDisplayName } from "./track-view.js";

/**
 * A band's display name.
 *
 * Both fallbacks matter: a value below the lowest rung genuinely has no band and
 * has to say so in words, and a rung the GM never titled still needs something
 * to call itself in a chat card.
 *
 * @param {{value: number, label: string}|null} threshold
 * @returns {string}
 */
export function bandDisplayName(threshold) {
  if (!threshold) return game.i18n.localize("PVC.Threshold.BelowFirst");
  return (
    threshold.label ||
    game.i18n.format("PVC.Threshold.UnnamedBand", { value: threshold.value })
  );
}

/**
 * Build the threshold half of a track's render context.
 *
 * @param {object} track A sanitized threshold-mode track.
 * @param {object} [options]
 * @param {boolean} [options.showLadder=false] Whether the rung *numbers* are
 *   drawn. The ticks themselves always are: a player should be able to see that
 *   a scale exists and roughly where they stand on it without being handed the
 *   whole map.
 * @returns {object}
 */
export function buildThresholdView(track, { showLadder = false } = {}) {
  const band = resolveBand(track.current, track.thresholds);
  const tone = bandTone(band, track.start);
  const displayTitle = trackDisplayName(track);
  const bandLabel = bandDisplayName(band);

  return {
    threshold: true,
    band,
    tone,
    bandLabel,
    bandDescription: band?.description ?? "",
    toneLabel: game.i18n.localize(`PVC.Tone.${tone}`),
    showLadder,
    ladderPercent: ladderPercent(track.current, track.min, track.max),
    startPercent: ladderPercent(track.start, track.min, track.max),
    ladder: track.thresholds.map((rung) => {
      const rungTone = bandTone(rung, track.start);
      return {
        ...rung,
        tone: rungTone,
        percent: ladderPercent(rung.value, track.min, track.max),
        // Which rung the value currently sits in, so it can be drawn as the
        // active one rather than left for the reader to work out from position.
        current: band ? rung.id === band.id : false,
        tooltip: rung.description
          ? `${bandDisplayName(rung)} (${rung.value}) — ${rung.description}`
          : `${bandDisplayName(rung)} (${rung.value})`
      };
    }),
    progressLabel: game.i18n.format("PVC.Aria.Band", {
      title: displayTitle,
      value: track.current,
      band: bandLabel
    })
  };
}
