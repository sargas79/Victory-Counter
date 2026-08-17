/**
 * Track state: read, sanitize, mutate, and announce.
 *
 * All shared state lives in a single world-scoped setting holding an array of
 * tracks. Foundry broadcasts world setting updates to every connected client
 * and fires the setting's `onChange` handler there, which is how player
 * screens stay in sync without a custom socket. Only a GM may write, which
 * Foundry also enforces server-side.
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
  clampInt,
  generateId,
  log,
  logError
} from "./constants.js";

/**
 * @typedef {object} Track
 * @property {number}  schema             Persisted schema version.
 * @property {string}  id                 Stable identifier for this track.
 * @property {boolean} active             Whether the track is currently running.
 * @property {string}  title              GM-supplied track name.
 * @property {number}  successes          Current successes.
 * @property {number}  failures           Current failures.
 * @property {number}  requiredSuccesses  Successes needed to win.
 * @property {number}  requiredFailures   Failures that end the track in defeat.
 * @property {boolean} trackFailures      Whether the failure count is used at all.
 * @property {boolean} visibleToPlayers   Whether non-GM users may see this track.
 * @property {string}  status             One of STATUS.
 */

/* -------------------------------------------- */
/*  Reading                                     */
/* -------------------------------------------- */

/**
 * Coerce arbitrary stored data into a valid Track.
 * Unknown keys are dropped, missing keys are backfilled from the defaults, and
 * every numeric field is clamped. This doubles as forward/backward migration.
 * @param {object} raw
 * @returns {Track}
 */
export function sanitizeTrack(raw) {
  const base = foundry.utils.deepClone(DEFAULT_TRACK);
  const merged = foundry.utils.mergeObject(base, raw ?? {}, {
    inplace: false,
    insertKeys: false,
    overwrite: true
  });

  merged.schema = SCHEMA_VERSION;
  merged.id = String(merged.id || "").trim() || generateId();
  merged.active = merged.active === true;
  merged.trackFailures = merged.trackFailures === true;
  merged.visibleToPlayers = merged.visibleToPlayers === true;

  merged.title = String(merged.title ?? "").slice(0, LIMITS.MAX_TITLE_LENGTH);

  merged.requiredSuccesses = clampInt(
    merged.requiredSuccesses,
    LIMITS.MIN_REQUIRED,
    LIMITS.MAX_REQUIRED
  );
  merged.requiredFailures = clampInt(
    merged.requiredFailures,
    LIMITS.MIN_REQUIRED,
    LIMITS.MAX_REQUIRED
  );
  merged.successes = clampInt(merged.successes, 0, LIMITS.MAX_COUNT);
  merged.failures = clampInt(merged.failures, 0, LIMITS.MAX_COUNT);

  const change = merged.lastChange ?? {};
  merged.lastChange = {
    track: ["successes", "failures"].includes(change.track) ? change.track : "",
    delta: clampInt(change.delta ?? 0, -LIMITS.MAX_COUNT, LIMITS.MAX_COUNT),
    time: Number.isFinite(Number(change.time)) ? Number(change.time) : 0
  };

  merged.status = computeStatus(merged);
  return merged;
}

/**
 * Derive the resolution status from the counts.
 * Successes are evaluated first: if both thresholds are met in the same update,
 * the track is a win. This is a deliberate, documented tie-break.
 * @param {Track} t
 * @returns {string}
 */
export function computeStatus(t) {
  if (t.successes >= t.requiredSuccesses) return STATUS.WON;
  if (t.trackFailures && t.failures >= t.requiredFailures) return STATUS.LOST;
  return STATUS.RUNNING;
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
 * All tracks, always sanitized, in display order.
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
    ...config,
    id: generateId(),
    active: true,
    successes: 0,
    failures: 0,
    lastChange: { track: "", delta: 0, time: 0 }
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
 * Apply configuration changes to a track without resetting its counts.
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
 * Adjust a track's success or failure count by a signed delta. Idempotent in
 * the sense that the resulting value is always derived from the stored value
 * and clamped, so a double click cannot push the counter out of range.
 * @param {string} id
 * @param {"successes"|"failures"} key
 * @param {number} delta
 * @returns {Promise<Track|null>}
 */
export async function adjustTrack(id, key, delta) {
  if (!assertGM()) return null;
  if (!["successes", "failures"].includes(key)) {
    logError(`Refusing to adjust unknown track field "${key}".`);
    return null;
  }

  const current = getTracks();
  const track = current.find((t) => t.id === id);
  if (!track?.active) {
    ui.notifications.warn(game.i18n.localize("PVC.Notify.NoTrack"));
    return null;
  }
  if (key === "failures" && !track.trackFailures) {
    ui.notifications.warn(game.i18n.localize("PVC.Notify.FailuresDisabled"));
    return null;
  }

  const value = clampInt(track[key] + Number(delta), 0, LIMITS.MAX_COUNT);
  if (value === track[key]) return track;

  const applied = value - track[key];
  const updated = {
    ...track,
    [key]: value,
    lastChange: { track: key, delta: applied, time: Date.now() }
  };
  const reason = game.i18n.format("PVC.Reason.Adjusted", {
    track: game.i18n.localize(key === "successes" ? "PVC.Successes" : "PVC.Failures"),
    delta: applied > 0 ? `+${applied}` : String(applied)
  });

  const result = await persistTracks(
    current.map((t) => (t.id === id ? updated : t)),
    { announceTrack: updated, announcePrevious: track, reason }
  );
  return result ? result.find((t) => t.id === id) ?? null : null;
}

/**
 * Set both counts of a track explicitly.
 * @param {string} id
 * @param {number} successes
 * @param {number} failures
 * @returns {Promise<Track|null>}
 */
export async function setTrackCounts(id, successes, failures) {
  if (!assertGM()) return null;
  const current = getTracks();
  const track = current.find((t) => t.id === id);
  if (!track?.active) {
    ui.notifications.warn(game.i18n.localize("PVC.Notify.NoTrack"));
    return null;
  }
  const nextSuccesses = clampInt(successes, 0, LIMITS.MAX_COUNT);
  const nextFailures = clampInt(failures, 0, LIMITS.MAX_COUNT);
  const successDelta = nextSuccesses - track.successes;
  const failureDelta = nextFailures - track.failures;

  // Attribute the footer line to whichever field actually moved.
  const key = successDelta !== 0 ? "successes" : failureDelta !== 0 ? "failures" : "";
  const delta = successDelta !== 0 ? successDelta : failureDelta;

  const updated = {
    ...track,
    successes: nextSuccesses,
    failures: nextFailures,
    lastChange: key ? { track: key, delta, time: Date.now() } : track.lastChange
  };

  const result = await persistTracks(
    current.map((t) => (t.id === id ? updated : t)),
    { announceTrack: updated, announcePrevious: track, reason: game.i18n.localize("PVC.Reason.CountsSet") }
  );
  return result ? result.find((t) => t.id === id) ?? null : null;
}

/**
 * Reset a track's counts to zero, keeping its configuration.
 * @param {string} id
 * @returns {Promise<Track|null>}
 */
export async function resetTrackCounts(id) {
  if (!assertGM()) return null;
  const current = getTracks();
  const track = current.find((t) => t.id === id);
  if (!track?.active) {
    ui.notifications.warn(game.i18n.localize("PVC.Notify.NoTrack"));
    return null;
  }
  const updated = {
    ...track,
    successes: 0,
    failures: 0,
    lastChange: { track: "", delta: 0, time: 0 }
  };
  const result = await persistTracks(
    current.map((t) => (t.id === id ? updated : t)),
    { reason: game.i18n.localize("PVC.Reason.Reset") }
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
  return persistTracks(next, { snapshot: false, reason: game.i18n.localize("PVC.Reason.Reordered") });
}

/**
 * Flip whether players can see a specific track. GM only; does not touch counts.
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
        successDelta: track.successes - previous.successes,
        failureDelta: track.failures - previous.failures
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
