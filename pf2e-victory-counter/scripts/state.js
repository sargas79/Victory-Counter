/**
 * Track state: read, sanitize, mutate, and announce.
 *
 * All shared state lives in a single world-scoped setting holding an array of
 * tracks. Foundry broadcasts world setting updates to every connected client
 * and fires the setting's `onChange` handler there, which is how player
 * screens stay in sync without a custom socket. Only a GM may write, which
 * Foundry also enforces server-side.
 *
 * A track measures progress toward one target. There is no failure counter:
 * a "bad" track is expressed with `type: "negative"`, which changes how it is
 * presented, not how it is counted.
 *
 * @module pf2e-victory-counter/state
 */

import {
  DEFAULT_TRACK,
  LIMITS,
  MODULE_ID,
  SCHEMA_VERSION,
  SETTINGS,
  STATUS,
  TRACK_TYPES,
  clampInt,
  generateId,
  log,
  logError
} from "./constants.js";
import { migrateTrackData } from "./migration.js";

/**
 * @typedef {object} Track
 * @property {number}  schema           Persisted schema version.
 * @property {string}  id               Stable identifier for this track.
 * @property {boolean} active           Whether the track is currently running.
 * @property {string}  title            GM-supplied track name.
 * @property {string}  type             One of TRACK_TYPES: "positive" | "negative".
 * @property {number}  current          Current progress. Never negative.
 * @property {number}  target           Progress needed to complete the track.
 * @property {boolean} visibleToPlayers Whether non-GM users may see this track.
 * @property {string}  status           One of STATUS.
 * @property {object}  [legacy]         Verbatim pre-3.0 fields, never read at runtime.
 */

/* -------------------------------------------- */
/*  Reading                                     */
/* -------------------------------------------- */

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

  merged.title = String(merged.title ?? "").slice(0, LIMITS.MAX_TITLE_LENGTH);

  merged.type = Object.values(TRACK_TYPES).includes(merged.type)
    ? merged.type
    : TRACK_TYPES.POSITIVE;

  merged.target = clampInt(merged.target, LIMITS.MIN_TARGET, LIMITS.MAX_TARGET);
  // The floor of 0 here is the single guarantee that progress is never negative;
  // every write path funnels through this function.
  merged.current = clampInt(merged.current, 0, LIMITS.MAX_COUNT);

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
 * @param {Track} t
 * @returns {string}
 */
export function computeStatus(t) {
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

  if (announceTrack) await postUpdateCard(announceTrack, announcePrevious ?? announceTrack, reason);
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

  const track = sanitizeTrack({
    schema: SCHEMA_VERSION,
    type: TRACK_TYPES.POSITIVE,
    ...config,
    id: generateId(),
    active: true,
    current: 0,
    lastChange: { delta: 0, time: 0 }
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

  const overshoot = allowsOvershoot();
  if (amount > 0 && !overshoot && isComplete(track)) {
    ui.notifications.warn(
      game.i18n.format("PVC.Notify.AlreadyComplete", { title: displayName(track) })
    );
    return track;
  }

  const ceiling = overshoot ? LIMITS.MAX_COUNT : Math.min(LIMITS.MAX_COUNT, track.target);
  // A decrease is never blocked by the ceiling, even if the stored value is
  // already above it (e.g. the GM turned overshoot off after going past target).
  const upperBound = amount < 0 ? LIMITS.MAX_COUNT : ceiling;
  const value = clampInt(track.current + amount, 0, upperBound);
  if (value === track.current) return track;

  const applied = value - track.current;
  const updated = {
    ...track,
    current: value,
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

  const overshoot = allowsOvershoot();
  const ceiling = overshoot ? LIMITS.MAX_COUNT : Math.min(LIMITS.MAX_COUNT, track.target);
  const requested = clampInt(value, 0, LIMITS.MAX_COUNT);
  const next = Math.min(requested, ceiling);
  if (next < requested) {
    ui.notifications.warn(
      game.i18n.format("PVC.Notify.CappedAtTarget", { target: track.target })
    );
  }

  const delta = next - track.current;
  const updated = {
    ...track,
    current: next,
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
  const updated = {
    ...track,
    current: 0,
    lastChange: { delta: 0, time: 0 }
  };
  const result = await persistTracks(
    current.map((t) => (t.id === id ? updated : t)),
    {
      announceTrack: updated,
      announcePrevious: track,
      reason: game.i18n.localize("PVC.Reason.Reset")
    }
  );
  if (result) ui.notifications.info(game.i18n.localize("PVC.Notify.Reset"));
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
 * Post a chat card summarizing a track's new state, if the GM enabled chat
 * updates. The card is whispered to GMs when the track is hidden from players.
 * @param {Track} track
 * @param {Track} previous
 * @param {string}    [reason]
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

  try {
    const content = await foundry.applications.handlebars.renderTemplate(
      `modules/${MODULE_ID}/templates/chat-card.hbs`,
      {
        track,
        reason: reason ?? "",
        statusLabel: game.i18n.localize(`PVC.Status.${track.status}`),
        typeLabel: game.i18n.localize(`PVC.Type.${track.type === TRACK_TYPES.NEGATIVE ? "Negative" : "Positive"}`),
        delta: track.current - previous.current
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
