/**
 * Presentation helpers for step tracks.
 *
 * The HUD, the GM control panel and the chat card all have to describe the same
 * strip of steps — how many there are, how many are filled, which of them the
 * GM has named, and which of those names the reader is allowed to read yet.
 * Deriving that in three places is how the three drift apart, so it is derived
 * once here, exactly as `threshold-view.js` does for the ladder.
 *
 * Pure view-model construction: nothing in this module reads or writes stored
 * state, and nothing decides *whether* something is shown, only how it looks
 * once the caller has decided.
 *
 * @module victory-counter/step-view
 */

import { LIMITS, progressPercent, resolveStep } from "./constants.js";

/**
 * A step label's display name.
 *
 * The fallback matters for the same reason a band's does: a step the GM marked
 * but never titled still needs something to call itself in a chat card and in a
 * tooltip.
 *
 * @param {{value: number, label: string}|null} step
 * @returns {string}
 */
export function stepDisplayName(step) {
  if (!step) return "";
  return (
    step.label || game.i18n.format("PVC.Step.UnnamedStep", { value: step.value })
  );
}

/**
 * Build the step half of a track's render context.
 *
 * @param {object} track A sanitized steps-mode track.
 * @param {object} [options]
 * @param {boolean} [options.revealAll=false] Whether names the track has *not*
 *   reached yet may be read. False hides them behind an unnamed marker; a label
 *   at or below the current value is shown either way, because a milestone the
 *   party has already hit is not a secret.
 * @returns {object}
 */
export function buildStepView(track, { revealAll = false } = {}) {
  const target = Math.max(0, Number(track.target) || 0);
  const current = Number(track.current) || 0;
  const displayTitle = track.title || game.i18n.localize("PVC.DefaultTitle");

  // Keyed lookup rather than a find() per pip: a 100-step track would otherwise
  // walk the label list a hundred times to place at most ten marks.
  const byValue = new Map(track.steps.map((label) => [Number(label.value), label]));
  const currentStep = resolveStep(current, track.steps);

  /**
   * Whether this label's name may be read. Reached labels always may.
   * @param {{value: number}} label
   * @returns {boolean}
   */
  const readable = (label) => revealAll || Number(label.value) <= current;

  /**
   * The tooltip for one step, which is also the only place an unnamed marker
   * says anything at all.
   * @param {{value: number, description: string}|null} label
   * @param {number} index
   * @returns {string}
   */
  const tooltipFor = (label, index) => {
    if (!label) return game.i18n.format("PVC.Step.PipTooltip", { value: index });
    if (!readable(label)) {
      return game.i18n.format("PVC.Step.HiddenTooltip", { value: index });
    }
    const name = `${stepDisplayName(label)} (${game.i18n.format("PVC.Step.PipTooltip", {
      value: label.value
    })})`;
    return label.description ? `${name} — ${label.description}` : name;
  };

  const pips = [];
  for (let index = 1; index <= target; index++) {
    const label = byValue.get(index) ?? null;
    // A label the reader may not name yet still shows *that* it is a milestone:
    // hiding the mark as well would make the strip lie about its own shape.
    const hidden = Boolean(label) && !readable(label);
    pips.push({
      index,
      filled: index <= current,
      labelled: Boolean(label),
      current: index === current,
      hidden,
      label: label && !hidden ? stepDisplayName(label) : "",
      description: label && !hidden ? label.description : "",
      tooltip: tooltipFor(label, index)
    });
  }

  // The fallback readout's ticks. Percentages rather than pip indices, because
  // above MAX_STEP_PIPS the strip becomes one continuous bar.
  const markers = track.steps
    .filter((label) => Number(label.value) <= target)
    .map((label) => {
      const hidden = !readable(label);
      return {
        value: label.value,
        percent: target > 0 ? (Number(label.value) / target) * 100 : 0,
        reached: Number(label.value) <= current,
        current: Number(label.value) === current,
        hidden,
        label: hidden ? "" : stepDisplayName(label),
        tooltip: tooltipFor(label, Number(label.value))
      };
    });

  // The next milestone ahead. A readout for whoever is allowed the whole list —
  // to a player who is not, the point of an unrevealed track is that they do not
  // know what is coming.
  //
  // Bounded by the target as well, matching `markers` above: a label left behind
  // by a lowered target is not reachable, and naming it as what comes next would
  // promise something the track can never arrive at.
  const next = revealAll
    ? track.steps.find(
        (label) => Number(label.value) > current && Number(label.value) <= target
      ) ?? null
    : null;

  return {
    // Not `steps`: the track's own `steps` array is spread into the same context,
    // so a flag under that name would be shadowed by it — and would read truthy
    // on a progress track that happens to be carrying labels.
    stepped: true,
    segmented: target <= LIMITS.MAX_STEP_PIPS,
    pips,
    markers,
    percent: Math.round(progressPercent(current, track.target)),
    currentLabel: currentStep ? stepDisplayName(currentStep) : "",
    currentDescription: currentStep?.description ?? "",
    nextLabel: next
      ? { value: next.value, name: stepDisplayName(next), description: next.description }
      : null,
    progressLabel: game.i18n.format("PVC.Aria.Step", {
      title: displayTitle,
      current,
      target,
      step: currentStep
        ? stepDisplayName(currentStep)
        : game.i18n.localize("PVC.Step.NoLabel")
    })
  };
}
