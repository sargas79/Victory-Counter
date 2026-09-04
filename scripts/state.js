/**
 * Track state: read, sanitize, mutate, and announce.
 *
 * All shared state lives in a single world-scoped setting holding an array of
 * tracks. Foundry broadcasts world setting updates to every connected client
 * and fires the setting's `onChange` handler there, which is how player
 * screens stay in sync without a custom socket. Only a GM may write, which
 * Foundry also enforces server-side.
 *
 * A track measures itself in one of two modes. A *progress* track counts up
 * toward one target and completes there; there is no failure counter, and a
 * "bad" track is expressed with `type: "negative"`, which changes how it is
 * presented, not how it is counted. A *threshold* track instead starts at a
 * GM-set value, moves up and down between its own bounds, and takes its meaning
 * from the band it currently sits in — it never completes.
 *
 * @module victory-counter/state
 */

import {
  DEFAULT_TRACK,
  LIMITS,
  MODULE_ID,
  SCHEMA_VERSION,
  SETTINGS,
  STATUS,
  TRACK_MODES,
  TRACK_TYPES,
  bandTone,
  clampInt,
  generateId,
  log,
  logError,
  resolveBand
} from "./constants.js";
import { migrateTrackData } from "./migration.js";
import { bandDisplayName } from "./threshold-view.js";

/**
 * @typedef {object} Threshold
 * @property {string}  id          Stable identifier for this rung.
 * @property {number}  value       The value at which this band begins.
 * @property {string}  label       GM-supplied band name.
 * @property {string}  description What entering this band means, shown to players.
 * @property {boolean} announce    Whether entering this band posts a chat card.
 */

/**
 * @typedef {object} Track
 * @property {number}  schema             Persisted schema version.
 * @property {string}  id                 Stable identifier for this track.
 * @property {boolean} active             Whether the track is currently running.
 * @property {string}  title              GM-supplied track name.
 * @property {string}  mode               One of TRACK_MODES: "progress" | "threshold".
 * @property {string}  type               One of TRACK_TYPES: "positive" | "negative".
 * @property {number}  current            Current value. Never negative in progress mode.
 * @property {number}  target             Progress needed to complete. Progress mode only.
 * @property {number}  start              Opening/reset value and tone reference. Threshold mode.
 * @property {number}  min                Inclusive floor for `current`. Threshold mode.
 * @property {number}  max                Inclusive ceiling for `current`. Threshold mode.
 * @property {Threshold[]} thresholds     The ladder, ascending by value. Threshold mode.
 * @property {string|null} band           Id of the band `current` sits in, or null.
 * @property {boolean} announceThresholds Whether band changes announce in chat.
 * @property {boolean} revealLadder       Whether players see the whole ladder.
 * @property {boolean} visibleToPlayers   Whether non-GM users may see this track.
 * @property {boolean} postToChat         Whether value changes announce in chat.
 * @property {string}  status             One of STATUS.
 * @property {object}  [legacy]           Verbatim pre-3.0 fields, never read at runtime.
 */

/* -------------------------------------------- */
/*  Reading                                     */
/* -------------------------------------------- */

/**
 * Coerce arbitrary stored data into a valid Threshold.
 * @param {any} raw
 * @returns {Threshold}
 */
export function sanitizeThreshold(raw) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return {
    id: String(source.id ?? "").trim() || generateId(),
    value: clampInt(source.value, LIMITS.MIN_VALUE, LIMITS.MAX_VALUE),
    label: String(source.label ?? "").slice(0, LIMITS.MAX_THRESHOLD_LABEL),
    description: String(source.description ?? "").slice(0, LIMITS.MAX_THRESHOLD_DESCRIPTION),
    // Missing on a rung written before this option existed; those keep announcing.
    announce: source.announce !== false
  };
}

/**
 * Sanitize a raw ladder: drop anything past the cap, drop duplicate values, and
 * sort ascending.
 *
 * Two rungs on the same number are dropped down to one because only one of them
 * could ever own that band — keeping both would make which description the
 * players see depend on array order. The first one written wins.
 *
 * The ascending sort is what lets {@link resolveBand} stop walking early, and it
 * is also the order the GM reads the ladder in.
 *
 * @param {any} raw
 * @returns {Threshold[]}
 */
export function sanitizeThresholds(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const byValue = new Map();
  const seenIds = new Set();

  for (const entry of list) {
    if (byValue.size >= LIMITS.MAX_THRESHOLDS) break;
    const threshold = sanitizeThreshold(entry);
    if (byValue.has(threshold.value)) continue;
    if (seenIds.has(threshold.id)) threshold.id = generateId();
    seenIds.add(threshold.id);
    byValue.set(threshold.value, threshold);
  }

  return [...byValue.values()].sort((a, b) => a.value - b.value);
}

/**
 * Coerce arbitrary stored data into a valid Track.
 * The record is migrated to the current shape first, then merged onto the
 * defaults with `insertKeys: false` so unknown keys are dropped and missing
 * keys are backfilled, then every field is clamped or coerced.
 * @param {any} raw
 * @returns {Track}
 */
export function sanitizeTrack(raw) {
  const base = foundry.utils.deepClone(DEFAULT_TRACK);
  const migrated = migrateTrackData(raw);
  const merged = foundry.utils.mergeObject(base, migrated, {
    inplace: false,
    insertKeys: false,
    overwrite: true
  });

  merged.schema = SCHEMA_VERSION;
  merged.id = String(merged.id || "").trim() || generateId();
  merged.active = merged.active === true;
  merged.visibleToPlayers = merged.visibleToPlayers === true;
  // Missing on tracks stored before this option existed; those keep announcing.
  merged.postToChat = merged.postToChat !== false;

  merged.title = String(merged.title ?? "").slice(0, LIMITS.MAX_TITLE_LENGTH);

  merged.type = Object.values(TRACK_TYPES).includes(merged.type)
    ? merged.type
    : TRACK_TYPES.POSITIVE;

  merged.mode = Object.values(TRACK_MODES).includes(merged.mode)
    ? merged.mode
    : TRACK_MODES.PROGRESS;

  merged.target = clampInt(merged.target, LIMITS.MIN_TARGET, LIMITS.MAX_TARGET);

  // The threshold fields are normalized in both modes, not just in threshold
  // mode. A track flipped to progress keeps a usable ladder to flip back to,
  // and the panel can show the ladder's size without the mode deciding whether
  // the field is trustworthy.
  merged.thresholds = sanitizeThresholds(merged.thresholds);
  merged.announceThresholds = merged.announceThresholds !== false;
  merged.revealLadder = merged.revealLadder === true;
  merged.min = clampInt(merged.min, LIMITS.MIN_VALUE, LIMITS.MAX_VALUE);
  // Ordered after min so a max below it collapses to it rather than inverting
  // the range, which would make every clamp below unsatisfiable.
  merged.max = clampInt(merged.max, merged.min, LIMITS.MAX_VALUE);
  merged.start = clampInt(merged.start, merged.min, merged.max);

  if (merged.mode === TRACK_MODES.THRESHOLD) {
    merged.current = clampInt(merged.current, merged.min, merged.max);
    // Derived on every read rather than trusted from storage, so a hand-edited
    // ladder or a stale record can never leave the band pointing at a rung that
    // no longer exists. It is still *written* back, because announcements
    // compare the band before a change with the band after it.
    merged.band = resolveBand(merged.current, merged.thresholds)?.id ?? null;
  } else {
    // The floor of 0 here is the single guarantee that progress is never
    // negative; every progress-mode write path funnels through this function.
    merged.current = clampInt(merged.current, 0, LIMITS.MAX_COUNT);
    merged.band = null;
  }

  const change = merged.lastChange ?? {};
  merged.lastChange = {
    delta: clampInt(change.delta ?? 0, -LIMITS.MAX_COUNT, LIMITS.MAX_COUNT),
    time: Number.isFinite(Number(change.time)) ? Number(change.time) : 0
  };

  // `legacy` is opaque payload: keep a plain object or drop it entirely.
  merged.legacy =
    merged.legacy && typeof merged.legacy === "object" && !Array.isArray(merged.legacy)
      ? merged.legacy
      : null;

  merged.status = computeStatus(merged);
  return merged;
}

/**
 * Derive the resolution status from the count.
 *
 * A threshold track has no finish line — it moves between bands for as long as
 * the GM keeps it open — so it is always running. That is what keeps the
 * "reached its target" notification and the completion styling off a track that
 * merely climbed to its top band.
 *
 * @param {Track} t
 * @returns {string}
 */
export function computeStatus(t) {
  if (t.mode === TRACK_MODES.THRESHOLD) return STATUS.RUNNING;
  return t.current >= t.target ? STATUS.COMPLETE : STATUS.RUNNING;
}

/**
 * Whether a track has reached its target.
 * @param {Track} t
 * @returns {boolean}
 */
export function isComplete(t) {
  return computeStatus(t) === STATUS.COMPLETE;
}

/**
 * Sanitize a raw array of tracks, dropping anything past the configured cap.
 * @param {any} raw
 * @returns {Track[]}
 */
export function sanitizeTracks(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  const clean = [];
  for (const entry of list) {
    if (clean.length >= LIMITS.MAX_TRACKS) break;
    const track = sanitizeTrack(entry);
    if (seen.has(track.id)) track.id = generateId();
    seen.add(track.id);
    clean.push(track);
  }
  return clean;
}

/**
 * All tracks, always sanitized and migrated, in display order.
 * @returns {Track[]}
 */
export function getTracks() {
  try {
    return sanitizeTracks(game.settings.get(MODULE_ID, SETTINGS.TRACKS));
  } catch (err) {
    logError("Failed to read track state; falling back to an empty list.", err);
    return [];
  }
}

/**
 * A single track by id, or null.
 * @param {string} id
 * @returns {Track|null}
 */
export function getTrack(id) {
  return getTracks().find((t) => t.id === id) ?? null;
}

/**
 * Whether the current user is allowed to see this track at all.
 * @param {Track} track
 * @returns {boolean}
 */
export function canUserSee(track) {
  if (!track?.active) return false;
  return game.user.isGM || track.visibleToPlayers;
}

/**
 * The tracks the current user is allowed to see, in display order.
 * @returns {Track[]}
 */
export function getVisibleTracks() {
  return getTracks().filter((t) => canUserSee(t));
}

/**
 * Whether the GM has allowed progress to be pushed past the target.
 * @returns {boolean}
 */
export function allowsOvershoot() {
  try {
    return game.settings.get(MODULE_ID, SETTINGS.ALLOW_OVERSHOOT) === true;
  } catch {
    return false;
  }
}

/**
 * Whether a track measures itself in bands rather than toward a target.
 * @param {Track} track
 * @returns {boolean}
 */
export function isThresholdTrack(track) {
  return track?.mode === TRACK_MODES.THRESHOLD;
}

/**
 * The inclusive range a track's value may be written into.
 *
 * Progress tracks run from zero to the target, or to the hard cap when the GM
 * has allowed overshoot. Threshold tracks run between their own bounds, which
 * may sit below zero — that is the whole point of the mode, so the shared
 * zero floor does not apply to them.
 *
 * @param {Track} track
 * @returns {{floor: number, ceiling: number}}
 */
function valueBounds(track) {
  if (isThresholdTrack(track)) return { floor: track.min, ceiling: track.max };
  const ceiling = allowsOvershoot()
    ? LIMITS.MAX_COUNT
    : Math.min(LIMITS.MAX_COUNT, track.target);
  return { floor: 0, ceiling };
}

/**
 * Whether progress rings are enabled for this world.
 * @returns {boolean}
 */
export function ringsEnabled() {
  try {
    return game.settings.get(MODULE_ID, SETTINGS.SHOW_RINGS) === true;
  } catch {
    return false;
  }
}

/* -------------------------------------------- */
/*  Writing (GM only)                           */
/* -------------------------------------------- */

/**
 * Guard helper: notify and return false when the user may not mutate state.
 * @returns {boolean}
 */
function assertGM() {
  if (game.user.isGM) return true;
  ui.notifications.warn(game.i18n.localize("PVC.Notify.GMOnly"));
  return false;
}

/**
 * A track's display name, for notifications and confirmations.
 * @param {Track} track
 * @returns {string}
 */
function displayName(track) {
  return track?.title || game.i18n.localize("PVC.DefaultTitle");
}

/**
 * Persist a new tracks array, storing the previous one as a single-level undo
 * snapshot. This is the only function in the module that writes shared data.
 * @param {Track[]} next
 * @param {object}    [options]
 * @param {boolean}   [options.snapshot=true]      Store the previous state for undo.
 * @param {Track}     [options.announceTrack]      Track to post a chat card for, if enabled.
 * @param {Track}     [options.announcePrevious]   Prior state of that track, for deltas.
 * @param {string}    [options.reason]             Localized description of the change.
 * @returns {Promise<Track[]|null>} The stored list, or null on failure.
 */
async function persistTracks(next, { snapshot = true, announceTrack, announcePrevious, reason } = {}) {
  if (!assertGM()) return null;

  const previous = getTracks();
  const clean = sanitizeTracks(next);

  try {
    if (snapshot) {
      await game.settings.set(MODULE_ID, SETTINGS.UNDO, {
        schema: SCHEMA_VERSION,
        tracks: previous,
        timestamp: Date.now()
      });
    }
    await game.settings.set(MODULE_ID, SETTINGS.TRACKS, clean);
  } catch (err) {
    logError("Failed to write track state.", err);
    ui.notifications.error(game.i18n.localize("PVC.Notify.WriteFailed"));
    return null;
  }

  log("Tracks updated", { previous, clean, reason });

  if (announceTrack) {
    // Announce from the record that was actually stored, not from the caller's
    // draft: `status` and `band` are derived during sanitization, so a draft
    // built by a mutator still carries the pre-change values for both. The
    // previous state comes from getTracks() and is already sanitized.
    const stored = clean.find((t) => t.id === announceTrack.id) ?? announceTrack;
    await postUpdateCard(stored, announcePrevious ?? stored, reason);
  }
  return clean;
}

/**
 * Create a new track from a configuration object and add it to the list.
 * New tracks are positive unless the caller says otherwise.
 * @param {Partial<Track>} config
 * @returns {Promise<Track|null>}
 */
export async function createTrack(config) {
  if (!assertGM()) return null;
  const current = getTracks();
  if (current.length >= LIMITS.MAX_TRACKS) {
    ui.notifications.warn(
      game.i18n.format("PVC.Notify.MaxTracksReached", { max: LIMITS.MAX_TRACKS })
    );
    return null;
  }

  // Sanitized in two passes. The opening value depends on `mode` and `start`,
  // and a caller may supply neither — reading them straight off the config would
  // mean deriving `current` from an `undefined` start, which lands the track on
  // its minimum rather than on its (defaulted) starting point. The first pass
  // settles mode, bounds and start; the second opens the track at the value
  // those imply, so `band` and `status` are derived from what is actually
  // stored.
  const normalized = sanitizeTrack({
    schema: SCHEMA_VERSION,
    mode: TRACK_MODES.PROGRESS,
    type: TRACK_TYPES.POSITIVE,
    ...config,
    id: generateId(),
    active: true,
    lastChange: { delta: 0, time: 0 }
  });

  const track = sanitizeTrack({
    ...normalized,
    // A progress track always opens empty. A threshold track opens wherever the
    // GM said it starts, which is the status quo its bands are measured against
    // — opening it at zero would put it in the wrong band before play begins.
    current: normalized.mode === TRACK_MODES.THRESHOLD ? normalized.start : 0
  });

  const result = await persistTracks([...current, track], {
    announceTrack: track,
    announcePrevious: track,
    reason: game.i18n.localize("PVC.Reason.Started")
  });
  if (result) ui.notifications.info(game.i18n.localize("PVC.Notify.Started"));
  return result ? result.find((t) => t.id === track.id) ?? null : null;
}

/**
 * Apply configuration changes to a track without resetting its progress.
 * @param {string} id
 * @param {Partial<Track>} config
 * @returns {Promise<Track|null>}
 */
export async function updateTrackConfig(id, config) {
  if (!assertGM()) return null;
  const current = getTracks();
  const track = current.find((t) => t.id === id);
  if (!track) {
    ui.notifications.warn(game.i18n.localize("PVC.Notify.NoTrack"));
    return null;
  }
  const next = current.map((t) => (t.id === id ? { ...t, ...config } : t));
  const result = await persistTracks(next, {
    reason: game.i18n.localize("PVC.Reason.Reconfigured")
  });
  return result ? result.find((t) => t.id === id) ?? null : null;
}

/**
 * Change a track's polarity. GM only; does not touch progress.
 * @param {string} id
 * @param {"positive"|"negative"} type
 * @returns {Promise<Track|null>}
 */
export async function setTrackType(id, type) {
  if (!assertGM()) return null;
  if (!Object.values(TRACK_TYPES).includes(type)) {
    logError(`Refusing to set unknown track type "${type}".`);
    return null;
  }
  return updateTrackConfig(id, { type });
}

/**
 * Adjust a track's progress by a signed delta. The resulting value is always
 * derived from the stored value and clamped, so a double click cannot push the
 * counter out of range, and it can never go below zero.
 *
 * When the world setting "allow progress beyond target" is off (the default),
 * a track that has already reached its target refuses further increases with a
 * notification, and a large increase is capped at the target rather than
 * overshooting it. Decreases are always allowed, so a mistake is reversible.
 *
 * @param {string} id
 * @param {number} delta
 * @returns {Promise<Track|null>}
 */
export async function adjustTrack(id, delta) {
  if (!assertGM()) return null;

  const amount = Number(delta);
  if (!Number.isFinite(amount) || amount === 0) return getTrack(id);

  const current = getTracks();
  const track = current.find((t) => t.id === id);
  if (!track?.active) {
    ui.notifications.warn(game.i18n.localize("PVC.Notify.NoTrack"));
    return null;
  }

  const threshold = isThresholdTrack(track);

  // Completion only exists in progress mode, so only progress mode can refuse an
  // increase for having already finished.
  if (!threshold && amount > 0 && !allowsOvershoot() && isComplete(track)) {
    ui.notifications.warn(
      game.i18n.format("PVC.Notify.AlreadyComplete", { title: displayName(track) })
    );
    return track;
  }

  const { floor, ceiling } = valueBounds(track);
  // A decrease is never blocked by the ceiling, even if the stored value is
  // already above it (e.g. the GM turned overshoot off after going past target,
  // or lowered a threshold track's max below where it currently sits).
  const upperBound = amount < 0 ? Math.max(ceiling, track.current) : ceiling;
  const value = clampInt(track.current + amount, floor, upperBound);

  if (value === track.current) {
    // Progress mode has already explained itself above; a threshold track that
    // will not move is sitting on one of its own bounds, and saying so is the
    // only feedback the GM would otherwise get for a button that does nothing.
    if (threshold) {
      ui.notifications.warn(
        game.i18n.format(
          amount > 0 ? "PVC.Notify.AtMaximum" : "PVC.Notify.AtMinimum",
          { title: displayName(track), value: amount > 0 ? track.max : track.min }
        )
      );
    }
    return track;
  }

  const applied = value - track.current;
  const updated = {
    ...track,
    current: value,
    status: computeStatus({ ...track, current: value }),
    lastChange: { delta: applied, time: Date.now() }
  };
  const reason = game.i18n.format("PVC.Reason.Adjusted", {
    delta: applied > 0 ? `+${applied}` : String(applied)
  });

  const result = await persistTracks(
    current.map((t) => (t.id === id ? updated : t)),
    { announceTrack: updated, announcePrevious: track, reason }
  );
  return result ? result.find((t) => t.id === id) ?? null : null;
}

/**
 * Set a track's progress explicitly.
 * @param {string} id
 * @param {number} value
 * @returns {Promise<Track|null>}
 */
export async function setTrackCurrent(id, value) {
  if (!assertGM()) return null;
  const current = getTracks();
  const track = current.find((t) => t.id === id);
  if (!track?.active) {
    ui.notifications.warn(game.i18n.localize("PVC.Notify.NoTrack"));
    return null;
  }

  const threshold = isThresholdTrack(track);
  const { floor, ceiling } = valueBounds(track);
  const requested = clampInt(value, LIMITS.MIN_VALUE, LIMITS.MAX_VALUE);
  const next = Math.min(Math.max(requested, floor), ceiling);

  if (next !== requested) {
    if (threshold) {
      // Either end of the range can reject the value here, so the message names
      // the whole range rather than the bound that happened to catch it.
      ui.notifications.warn(
        game.i18n.format("PVC.Notify.ClampedToRange", { min: floor, max: ceiling })
      );
    } else if (next < requested) {
      // A negative input in progress mode is silently floored at zero, as it
      // always has been; only overshooting the target is worth explaining.
      ui.notifications.warn(
        game.i18n.format("PVC.Notify.CappedAtTarget", { target: track.target })
      );
    }
  }

  const delta = next - track.current;
  const updated = {
    ...track,
    current: next,
    status: computeStatus({ ...track, current: next }),
    lastChange: delta === 0 ? track.lastChange : { delta, time: Date.now() }
  };

  const result = await persistTracks(
    current.map((t) => (t.id === id ? updated : t)),
    {
      announceTrack: updated,
      announcePrevious: track,
      reason: game.i18n.localize("PVC.Reason.ProgressSet")
    }
  );
  return result ? result.find((t) => t.id === id) ?? null : null;
}

/**
 * Reset a track's progress to zero, keeping its configuration.
 * @param {string} id
 * @returns {Promise<Track|null>}
 */
export async function resetTrackProgress(id) {
  if (!assertGM()) return null;
  const current = getTracks();
  const track = current.find((t) => t.id === id);
  if (!track?.active) {
    ui.notifications.warn(game.i18n.localize("PVC.Notify.NoTrack"));
    return null;
  }
  // "Back to the beginning" means zero for a progress track, but for a threshold
  // track it means the status quo the GM defined, which is rarely zero and may
  // not even be inside the ladder's positive half.
  const threshold = isThresholdTrack(track);
  const base = threshold ? track.start : 0;

  const updated = {
    ...track,
    current: base,
    lastChange: { delta: 0, time: 0 }
  };
  const result = await persistTracks(
    current.map((t) => (t.id === id ? updated : t)),
    {
      announceTrack: updated,
      announcePrevious: track,
      reason: game.i18n.localize(
        threshold ? "PVC.Reason.ResetToStart" : "PVC.Reason.Reset"
      )
    }
  );
  if (result) {
    ui.notifications.info(
      threshold
        ? game.i18n.format("PVC.Notify.ResetToStart", { value: base })
        : game.i18n.localize("PVC.Notify.Reset")
    );
  }
  return result ? result.find((t) => t.id === id) ?? null : null;
}

/**
 * Remove a track and clear it from every screen.
 * The previous state remains available through {@link undo} until the next write.
 * @param {string} id
 * @returns {Promise<Track[]|null>}
 */
export async function removeTrack(id) {
  if (!assertGM()) return null;
  const current = getTracks();
  if (!current.some((t) => t.id === id)) {
    ui.notifications.warn(game.i18n.localize("PVC.Notify.NoTrack"));
    return null;
  }
  const result = await persistTracks(
    current.filter((t) => t.id !== id),
    { reason: game.i18n.localize("PVC.Reason.Cleared") }
  );
  if (result) ui.notifications.info(game.i18n.localize("PVC.Notify.Cleared"));
  return result;
}

/**
 * Move a track up or down in display order.
 * @param {string} id
 * @param {-1|1} direction
 * @returns {Promise<Track[]|null>}
 */
export async function moveTrack(id, direction) {
  if (!assertGM()) return null;
  const current = getTracks();
  const index = current.findIndex((t) => t.id === id);
  const target = index + direction;
  if (index === -1 || target < 0 || target >= current.length) return current;

  const next = [...current];
  [next[index], next[target]] = [next[target], next[index]];
  return persistTracks(next, { reason: game.i18n.localize("PVC.Reason.Reordered") });
}

/**
 * Flip whether players can see a specific track. GM only; does not touch progress.
 * @param {string} id
 * @returns {Promise<Track|null>}
 */
export async function toggleTrackVisibility(id) {
  if (!assertGM()) return null;
  const current = getTracks();
  const track = current.find((t) => t.id === id);
  if (!track?.active) {
    ui.notifications.warn(game.i18n.localize("PVC.Notify.NoTrack"));
    return null;
  }
  const visible = !track.visibleToPlayers;
  const updated = { ...track, visibleToPlayers: visible };
  const result = await persistTracks(
    current.map((t) => (t.id === id ? updated : t)),
    { reason: game.i18n.localize("PVC.Reason.Reconfigured") }
  );
  if (result) {
    ui.notifications.info(
      game.i18n.localize(visible ? "PVC.Notify.NowVisible" : "PVC.Notify.NowHidden")
    );
  }
  return result ? result.find((t) => t.id === id) ?? null : null;
}

/**
 * Flip whether this track announces its progress changes in chat. Takes effect
 * immediately for the next change; it is not tied to when the track was
 * created. The world setting "Post Progress to Chat" still gates every card.
 * @param {string} id
 * @returns {Promise<Track|null>}
 */
export async function toggleTrackAnnounce(id) {
  if (!assertGM()) return null;
  const current = getTracks();
  const track = current.find((t) => t.id === id);
  if (!track?.active) {
    ui.notifications.warn(game.i18n.localize("PVC.Notify.NoTrack"));
    return null;
  }
  const postToChat = track.postToChat === false;
  const updated = { ...track, postToChat };
  const result = await persistTracks(
    current.map((t) => (t.id === id ? updated : t)),
    { reason: game.i18n.localize("PVC.Reason.Reconfigured") }
  );
  if (result) {
    ui.notifications.info(
      game.i18n.localize(postToChat ? "PVC.Notify.NowAnnouncing" : "PVC.Notify.NotAnnouncing")
    );
  }
  return result ? result.find((t) => t.id === id) ?? null : null;
}

/**
 * Replace a track's threshold ladder.
 *
 * Deliberately posts no chat card. Rewriting the scale is not the same event as
 * the value moving across it, and a GM tidying up rung descriptions mid-session
 * should not fire "the situation has changed" at the table. The band is still
 * recomputed during sanitization, so the new ladder takes effect at once.
 *
 * @param {string} id
 * @param {any[]} thresholds
 * @returns {Promise<Track|null>}
 */
export async function setTrackThresholds(id, thresholds) {
  if (!assertGM()) return null;
  const current = getTracks();
  const track = current.find((t) => t.id === id);
  if (!track) {
    ui.notifications.warn(game.i18n.localize("PVC.Notify.NoTrack"));
    return null;
  }

  const clean = sanitizeThresholds(thresholds);
  const requested = Array.isArray(thresholds) ? thresholds.length : 0;
  if (requested > clean.length) {
    // Silently losing a rung the GM typed would look like the editor dropped it
    // at random, so name the two reasons it can happen.
    ui.notifications.warn(
      game.i18n.format("PVC.Notify.ThresholdsDropped", {
        dropped: requested - clean.length,
        max: LIMITS.MAX_THRESHOLDS
      })
    );
  }

  const result = await persistTracks(
    current.map((t) => (t.id === id ? { ...t, thresholds: clean } : t)),
    { reason: game.i18n.localize("PVC.Reason.ThresholdsUpdated") }
  );
  if (result) ui.notifications.info(game.i18n.localize("PVC.Notify.ThresholdsSaved"));
  return result ? result.find((t) => t.id === id) ?? null : null;
}

/**
 * Flip whether this track announces band changes in chat. Applies immediately;
 * the world setting "Post Progress to Chat" still gates every card, and each
 * rung can opt out of announcing on its own.
 * @param {string} id
 * @returns {Promise<Track|null>}
 */
export async function toggleThresholdAnnounce(id) {
  if (!assertGM()) return null;
  const current = getTracks();
  const track = current.find((t) => t.id === id);
  if (!track?.active) {
    ui.notifications.warn(game.i18n.localize("PVC.Notify.NoTrack"));
    return null;
  }
  const announceThresholds = track.announceThresholds === false;
  const result = await persistTracks(
    current.map((t) => (t.id === id ? { ...t, announceThresholds } : t)),
    { reason: game.i18n.localize("PVC.Reason.Reconfigured") }
  );
  if (result) {
    ui.notifications.info(
      game.i18n.localize(
        announceThresholds
          ? "PVC.Notify.NowAnnouncingBands"
          : "PVC.Notify.NotAnnouncingBands"
      )
    );
  }
  return result ? result.find((t) => t.id === id) ?? null : null;
}

/**
 * Restore the single-level undo snapshot for the whole track list.
 * @returns {Promise<Track[]|null>}
 */
export async function undo() {
  if (!assertGM()) return null;
  let buffer;
  try {
    buffer = game.settings.get(MODULE_ID, SETTINGS.UNDO);
  } catch (err) {
    logError("Failed to read the undo buffer.", err);
    buffer = null;
  }
  if (!buffer?.tracks) {
    ui.notifications.warn(game.i18n.localize("PVC.Notify.NothingToUndo"));
    return null;
  }
  const result = await persistTracks(buffer.tracks, {
    snapshot: false,
    reason: game.i18n.localize("PVC.Reason.Undone")
  });
  if (result) {
    // Consume the buffer so undo cannot be replayed against stale data.
    await game.settings.set(MODULE_ID, SETTINGS.UNDO, {});
    ui.notifications.info(game.i18n.localize("PVC.Notify.Undone"));
  }
  return result;
}

/**
 * Whether an undo snapshot is currently available.
 * @returns {boolean}
 */
export function hasUndo() {
  try {
    return Array.isArray(game.settings.get(MODULE_ID, SETTINGS.UNDO)?.tracks);
  } catch {
    return false;
  }
}

/* -------------------------------------------- */
/*  Announcements                               */
/* -------------------------------------------- */

/**
 * Describe a threshold track's band change, or null when the band did not move.
 *
 * The comparison is on the stored band *id*, not on the values either side, so
 * it is exact: a change that leaves the value in the same band is not a
 * crossing no matter how large it was, and one that skips several rungs in a
 * single step is still one crossing with a known destination.
 *
 * `passed` lists the rungs that were entered and left again in the same step, so
 * a +6 that jumps two bands does not silently swallow the one in between. It is
 * derived from the two *bands*, not from the two values, so a rung the value
 * merely reached without settling in is not double-counted as the destination.
 *
 * @param {Track} track    Stored state after the change.
 * @param {Track} previous Stored state before it.
 * @returns {{entered: Threshold|null, left: Threshold|null, direction: 1|-1, passed: Threshold[]}|null}
 */
export function describeCrossing(track, previous) {
  if (!isThresholdTrack(track) || !isThresholdTrack(previous)) return null;
  if (track.band === previous.band) return null;

  const entered = track.thresholds.find((t) => t.id === track.band) ?? null;
  const left = previous.thresholds.find((t) => t.id === previous.band) ?? null;

  // "Below every rung" has no value of its own, so it is treated as lying below
  // all of them — which is exactly what it means.
  const from = left ? Number(left.value) : Number.NEGATIVE_INFINITY;
  const to = entered ? Number(entered.value) : Number.NEGATIVE_INFINITY;
  const direction = to > from ? 1 : -1;

  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const passed = track.thresholds.filter((t) => t.value > lo && t.value < hi);
  // Read them in the order they were actually crossed.
  if (direction < 0) passed.reverse();

  return { entered, left, direction, passed };
}

/**
 * Post a chat card summarizing a track's new state.
 *
 * Three gates decide whether anything is posted, and they are independent:
 *
 * 1. The world setting is the master switch and vetoes everything.
 * 2. `postToChat` opts the track into announcing *value changes*.
 * 3. `announceThresholds`, plus the entered rung's own `announce`, opts a
 *    threshold track into announcing *band changes*.
 *
 * A change that trips both 2 and 3 posts one card carrying both, not two cards.
 * A progress track can never trip 3, so its behaviour is unchanged.
 *
 * The card is whispered to GMs when the track is hidden from players.
 *
 * @param {Track} track
 * @param {Track} previous
 * @param {string} [reason]
 * @returns {Promise<void>}
 */
async function postUpdateCard(track, previous, reason) {
  if (!game.user.isGM) return;
  if (!track.active) return;

  let enabled = false;
  try {
    enabled = game.settings.get(MODULE_ID, SETTINGS.POST_CHAT) === true;
  } catch {
    enabled = false;
  }
  if (!enabled) return;

  const crossing = describeCrossing(track, previous);
  const announceChange = track.postToChat !== false;
  const announceCrossing =
    Boolean(crossing) &&
    track.announceThresholds !== false &&
    // A drop below the lowest rung has no threshold object to consult, so the
    // track-level toggle is the only gate it can answer to.
    (crossing.entered ? crossing.entered.announce !== false : true);

  if (!announceChange && !announceCrossing) return;

  const threshold = isThresholdTrack(track);
  const template = threshold ? "threshold-card.hbs" : "chat-card.hbs";

  try {
    const content = await foundry.applications.handlebars.renderTemplate(
      `modules/${MODULE_ID}/templates/${template}`,
      {
        track,
        reason: reason ?? "",
        statusLabel: game.i18n.localize(`PVC.Status.${track.status}`),
        typeLabel: game.i18n.localize(
          `PVC.Type.${track.type === TRACK_TYPES.NEGATIVE ? "Negative" : "Positive"}`
        ),
        delta: track.current - previous.current,
        ...(threshold ? thresholdCardContext(track, crossing, announceCrossing) : {})
      }
    );

    const data = { content, speaker: { alias: game.i18n.localize("PVC.Title") } };
    if (!track.visibleToPlayers) {
      data.whisper = ChatMessage.getWhisperRecipients("GM").map((u) => u.id);
    }
    await ChatMessage.create(data);
  } catch (err) {
    // A failed chat card must never block the state update itself.
    logError("Failed to post the track chat card.", err);
  }
}

/**
 * The threshold-specific half of a chat card's context.
 *
 * `showCrossing` is passed in rather than derived from `crossing` because a band
 * change that the GM muted still has to render the resulting state — the card
 * says where the track now stands, it just does not make an announcement of the
 * move itself.
 *
 * @param {Track} track
 * @param {ReturnType<typeof describeCrossing>} crossing
 * @param {boolean} showCrossing
 * @returns {object}
 */
function thresholdCardContext(track, crossing, showCrossing) {
  const band = resolveBand(track.current, track.thresholds);
  const tone = bandTone(band, track.start);

  return {
    threshold: true,
    band,
    tone,
    bandLabel: bandDisplayName(band),
    bandDescription: band?.description ?? "",
    crossing: showCrossing && crossing
      ? {
          rising: crossing.direction > 0,
          leftLabel: bandDisplayName(crossing.left),
          passed: crossing.passed.map((t) => bandDisplayName(t))
        }
      : null
  };
}
