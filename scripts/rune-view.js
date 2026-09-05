/**
 * Presentation helpers for the rune circle.
 *
 * The circle is a *display*, not a mode: it draws a progress track and a
 * threshold track from the fields each already has, and neither of them learns
 * anything about it. What differs between the two is only what one seat means —
 * a point of the target, or a rung of the ladder — so that is the one thing
 * this module branches on, and everything after it is shared.
 *
 * Derived once here for the same reason as
 * {@link module:victory-counter/threshold-view}: the HUD and the control panel
 * both draw this figure, and a thing derived in two places is a thing that will
 * eventually disagree with itself.
 *
 * Pure view-model construction: nothing here reads or writes stored state, and
 * nothing decides *whether* a circle is shown — {@link usesRuneCircle} answers
 * that, and the caller asks it.
 *
 * @module victory-counter/rune-view
 */

import {
  CIRCLE,
  RUNE_GLYPHS,
  TRACK_DISPLAYS,
  TRACK_MODES,
  bandTone,
  runeSeats
} from "./constants.js";
import { bandDisplayName } from "./threshold-view.js";

/**
 * How many seats a track's circle would have.
 *
 * A progress track seats one rune per point of its target, so a rune is a
 * success. A threshold track seats one per rung, so a rune is a band — the
 * ladder is already the list of positions the GM wrote, and asking them to
 * write a second one would be asking the same question twice.
 *
 * @param {object} track A sanitized track.
 * @returns {number}
 */
export function runeSeatCount(track) {
  if (track.mode === TRACK_MODES.THRESHOLD) return track.thresholds.length;
  return track.target;
}

/**
 * Whether this track can actually be drawn as a rune circle right now.
 *
 * Beyond {@link CIRCLE.MAX_POSITIONS} the seats stop being countable at a
 * glance, and below one there is nothing to draw at all — a threshold track
 * whose ladder is still empty, most often, since the display can be chosen
 * before the rungs are written.
 *
 * The answer is deliberately allowed to change without the GM touching the
 * display field: raising a target past the cap, or emptying a ladder, falls the
 * card back to its standard readout rather than leaving it blank. The choice is
 * remembered either way, so the circle returns when the track can carry one.
 *
 * @param {object} track A sanitized track.
 * @returns {boolean}
 */
export function usesRuneCircle(track) {
  if (track?.display !== TRACK_DISPLAYS.CIRCLE) return false;
  const count = runeSeatCount(track);
  return count >= 1 && count <= CIRCLE.MAX_POSITIONS;
}

/**
 * The GM's override for one seat, or null.
 * @param {object} track
 * @param {string} key
 * @returns {{key: string, glyph: string, label: string}|null}
 */
function overrideFor(track, key) {
  return track.runes.find((rune) => rune.key === key) ?? null;
}

/**
 * What each seat of a track's circle *is*, before anything is known about
 * whether it has been earned: its identity, the rung behind it if there is one,
 * and the glyph and name it carries when the GM has said nothing.
 *
 * Shared with the rune editor, which needs exactly this and nothing else — it
 * shows the defaults as placeholders, so a GM who clears a field gets the
 * default back rather than a blank seat. Deriving it in the editor as well
 * would be two answers to "what are this track's seats?".
 *
 * @param {object} track A sanitized track.
 * @returns {Array<{index: number, key: string, rung: object|null,
 *   defaultGlyph: string, defaultName: string, caption: string}>}
 */
export function runeSeatOutline(track) {
  const threshold = track.mode === TRACK_MODES.THRESHOLD;
  const count = Math.min(runeSeatCount(track), CIRCLE.MAX_POSITIONS);
  const list = [];

  for (let index = 0; index < count; index += 1) {
    const rung = threshold ? track.thresholds[index] : null;
    list.push({
      index,
      // A threshold seat is its rung, so it keeps its overrides when the GM
      // inserts another rung beneath it. A progress seat is only ever its
      // position, and has nothing more stable to be keyed by.
      key: rung ? rung.id : String(index),
      rung,
      defaultGlyph: RUNE_GLYPHS[index % RUNE_GLYPHS.length],
      defaultName: rung
        ? bandDisplayName(rung)
        : game.i18n.format("PVC.Circle.SeatName", { index: index + 1 }),
      caption: rung
        ? game.i18n.format("PVC.Circle.SeatRung", { value: rung.value })
        : game.i18n.format("PVC.Circle.SeatOrdinal", { index: index + 1 })
    });
  }
  return list;
}

/**
 * Build the rune-circle half of a track's render context.
 *
 * @param {object} track A sanitized track that {@link usesRuneCircle} accepts.
 * @param {object} [options]
 * @param {boolean} [options.showLabels=false] Whether a seat the track has *not*
 *   reached names itself. A seated rune always does — the players watched it
 *   land — but what lies ahead on a threshold ladder is the GM's to give away,
 *   the same call `revealLadder` already makes for the rungs of the rail.
 *
 *   Ignored on a progress track, which has no ladder to withhold: its seats are
 *   numbered "Rune 1", "Rune 2" unless the GM named them, and hiding *those*
 *   would be keeping a secret that does not exist.
 * @returns {object}
 */
export function buildRuneView(track, { showLabels = false } = {}) {
  const threshold = track.mode === TRACK_MODES.THRESHOLD;
  const outline = runeSeatOutline(track);
  const geometry = runeSeats(outline.length);
  const displayTitle = track.title || game.i18n.localize("PVC.DefaultTitle");

  // A progress track fills its seats in order, so how many are taken is the
  // whole story. Overshoot has nowhere to go — past the target every seat is
  // already taken, and the readout in the centre keeps reporting the true value.
  const filled = Math.max(0, Math.min(track.current, track.target));

  const runes = outline.map((seat, index) => {
    const place = geometry[index];
    const { rung } = seat;
    const override = overrideFor(track, seat.key);

    // Seated means "the track has reached this": a rung whose value has been
    // met, or a point of the target that has been scored. `active` is the
    // leading edge — the band the track is actually in, taken from the same
    // lookup the rest of the module uses, or the rune just earned.
    const seated = rung ? track.current >= rung.value : index < filled;
    const active = rung ? track.band === rung.id : index === filled - 1;
    const name = override?.label || seat.defaultName;
    const named = seated || showLabels || !threshold;
    // One tooltip string rather than a conditional in the template: what a rune
    // is willing to say about itself is a single decision, and splitting it
    // across two files is how the HUD and the panel would come to disagree.
    const parts = [named ? name : game.i18n.localize("PVC.Circle.Unknown")];
    if (named && rung) parts.push(`(${rung.value})`);
    if (named && rung?.description) parts.push(`— ${rung.description}`);

    return {
      key: seat.key,
      seated,
      active,
      name,
      glyph: override?.glyph || seat.defaultGlyph,
      // A progress seat has no band, so it has no tone of its own; the card's
      // polarity already says how that track reads.
      tone: rung ? bandTone(rung, track.start) : "",
      // The rendered position: its seat once earned, its drift before that.
      left: seated ? place.left : place.adriftLeft,
      top: seated ? place.top : place.adriftTop,
      rotation: seated ? 0 : place.rotation,
      tooltip: parts.join(" ")
    };
  });

  const seatedCount = runes.filter((rune) => rune.seated).length;

  // The circle replaces the readout that used to carry the band in words, so on
  // a threshold track the label has to carry it instead. "3 of 5 runes in place"
  // is the wrong half of the story when the meaning lives in the band, and it is
  // the only half a screen reader would otherwise get.
  const active = runes.find((rune) => rune.active);
  const circleLabel = threshold
    ? game.i18n.format("PVC.Aria.CircleBand", {
        title: displayTitle,
        value: track.current,
        band: active ? active.name : bandDisplayName(null),
        seated: seatedCount,
        total: runes.length
      })
    : game.i18n.format("PVC.Aria.Circle", {
        title: displayTitle,
        seated: seatedCount,
        total: runes.length
      });

  return {
    circle: true,
    runes,
    seatCount: runes.length,
    seatedCount,
    // The plate is aria-hidden down to the individual runes, so this is the
    // entire accessible name of the figure in both windows.
    circleLabel
  };
}
