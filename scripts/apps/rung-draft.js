/**
 * Reading a rung list back out of an editor's DOM.
 *
 * Both editors in this module — the threshold ladder and the step labels — are
 * a list of identical four-field rows held as a local draft, and both have to
 * scrape that draft back off the page before any action that re-renders, so
 * text typed but not yet saved survives adding or removing a row.
 *
 * Shared rather than copied for the same reason `window-fit.js` is: the two
 * editors edit the same shape, and a fix to how one of them recovers a
 * half-typed row is a fix to both. Everything that genuinely differs between
 * them — bounds, caps, localization, what Save calls — stays in the two classes.
 *
 * @module victory-counter/apps/rung-draft
 */

/**
 * Read every rung row in an editor back into a plain draft array.
 *
 * Fields are addressed with `data-field` rather than `name` so that a dozen rows
 * of identically-named inputs never form an ambiguous form submission; the rows
 * themselves are marked with `data-rung-row`, which is the one thing the two
 * editors' templates must keep in common.
 *
 * Values are returned exactly as typed. Coercion, clamping, deduplication and
 * sorting all belong to the state layer, which owns them for every write path —
 * doing any of it here would give the editor a second opinion about what the GM
 * is about to get.
 *
 * @param {HTMLElement|null} root The editor's root element.
 * @returns {Array<{id: string, value: string, label: string, description: string, announce: boolean}>}
 */
export function readRungRows(root) {
  if (!root) return [];

  return [...root.querySelectorAll("[data-rung-row]")].map((row) => ({
    id: row.dataset.id,
    value: row.querySelector('[data-field="value"]')?.value,
    label: row.querySelector('[data-field="label"]')?.value,
    description: row.querySelector('[data-field="description"]')?.value,
    // Missing checkbox means a row rendered before this option existed, which
    // keeps announcing — the same default the sanitizer applies.
    announce: row.querySelector('[data-field="announce"]')?.checked !== false
  }));
}
