/**
 * Challenge state: read, sanitize, mutate, and announce.
 *
 * All shared state lives in a single world-scoped setting. Foundry broadcasts
 * world setting updates to every connected client and fires the setting's
 * `onChange` handler there, which is how player screens stay in sync without a
 * custom socket. Only a GM may write, which Foundry also enforces server-side.
 *
 * @module pf2e-victory-counter/state
 */

import {
  DEFAULT_CHALLENGE,
  LIMITS,
  MODULE_ID,
  SCHEMA_VERSION,
  SETTINGS,
  STATUS,
  clampInt,
  log,
  logError
} from "./constants.js";

/**
 * @typedef {object} Challenge
 * @property {number}  schema             Persisted schema version.
 * @property {boolean} active             Whether a challenge is currently running.
 * @property {string}  title              GM-supplied challenge name.
 * @property {number}  successes          Current successes.
 * @property {number}  failures           Current failures.
 * @property {number}  requiredSuccesses  Successes needed to win.
 * @property {number}  requiredFailures   Failures that end the challenge in defeat.
 * @property {boolean} trackFailures      Whether the failure track is used at all.
 * @property {boolean} visibleToPlayers   Whether non-GM users may see the counter.
 * @property {string}  status             One of STATUS.
 */

/* -------------------------------------------- */
/*  Reading                                     */
/* -------------------------------------------- */

/**
 * Coerce arbitrary stored data into a valid Challenge.
 * Unknown keys are dropped, missing keys are backfilled from the defaults, and
 * every numeric field is clamped. This doubles as forward/backward migration.
 * @param {object} raw
 * @returns {Challenge}
 */
export function sanitizeChallenge(raw) {
  const base = foundry.utils.deepClone(DEFAULT_CHALLENGE);
  const merged = foundry.utils.mergeObject(base, raw ?? {}, {
    inplace: false,
    insertKeys: false,
    overwrite: true
  });

  merged.schema = SCHEMA_VERSION;
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
 * the challenge is a win. This is a deliberate, documented tie-break.
 * @param {Challenge} c
 * @returns {string}
 */
export function computeStatus(c) {
  if (c.successes >= c.requiredSuccesses) return STATUS.WON;
  if (c.trackFailures && c.failures >= c.requiredFailures) return STATUS.LOST;
  return STATUS.RUNNING;
}

/**
 * The current challenge, always sanitized.
 * @returns {Challenge}
 */
export function getChallenge() {
  try {
    return sanitizeChallenge(game.settings.get(MODULE_ID, SETTINGS.CHALLENGE));
  } catch (err) {
    logError("Failed to read challenge state; falling back to defaults.", err);
    return foundry.utils.deepClone(DEFAULT_CHALLENGE);
  }
}

/**
 * Whether the current user is allowed to see the counter at all.
 * @param {Challenge} [challenge]
 * @returns {boolean}
 */
export function canUserSee(challenge = getChallenge()) {
  if (!challenge.active) return false;
  return game.user.isGM || challenge.visibleToPlayers;
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
 * Persist a new challenge state, storing the previous one as a single-level
 * undo snapshot. This is the only function in the module that writes shared data.
 * @param {Challenge} next
 * @param {object}    [options]
 * @param {boolean}   [options.snapshot=true] Store the previous state for undo.
 * @param {boolean}   [options.announce=true] Post a chat card if enabled.
 * @param {string}    [options.reason]        Localized description of the change.
 * @returns {Promise<Challenge|null>} The stored state, or null on failure.
 */
export async function setChallenge(next, { snapshot = true, announce = true, reason } = {}) {
  if (!assertGM()) return null;

  const previous = getChallenge();
  const clean = sanitizeChallenge(next);

  try {
    if (snapshot) {
      await game.settings.set(MODULE_ID, SETTINGS.UNDO, {
        schema: SCHEMA_VERSION,
        challenge: previous,
        timestamp: Date.now()
      });
    }
    await game.settings.set(MODULE_ID, SETTINGS.CHALLENGE, clean);
  } catch (err) {
    logError("Failed to write challenge state.", err);
    ui.notifications.error(game.i18n.localize("PVC.Notify.WriteFailed"));
    return null;
  }

  log("Challenge updated", { previous, clean, reason });

  if (announce) await postUpdateCard(clean, previous, reason);
  return clean;
}

/**
 * Start (or restart) a challenge from a configuration object.
 * Counts are reset to zero. Callers are responsible for confirming an overwrite.
 * @param {Partial<Challenge>} config
 * @returns {Promise<Challenge|null>}
 */
export async function startChallenge(config) {
  if (!assertGM()) return null;
  const next = sanitizeChallenge({
    ...foundry.utils.deepClone(DEFAULT_CHALLENGE),
    ...config,
    active: true,
    successes: 0,
    failures: 0,
    lastChange: { track: "", delta: 0, time: 0 }
  });
  const result = await setChallenge(next, {
    reason: game.i18n.localize("PVC.Reason.Started")
  });
  if (result) ui.notifications.info(game.i18n.localize("PVC.Notify.Started"));
  return result;
}

/**
 * Apply configuration changes to a running challenge without resetting counts.
 * @param {Partial<Challenge>} config
 * @returns {Promise<Challenge|null>}
 */
export async function updateConfig(config) {
  if (!assertGM()) return null;
  const current = getChallenge();
  if (!current.active) {
    ui.notifications.warn(game.i18n.localize("PVC.Notify.NoChallenge"));
    return null;
  }
  return setChallenge({ ...current, ...config }, {
    announce: false,
    reason: game.i18n.localize("PVC.Reason.Reconfigured")
  });
}

/**
 * Adjust a track by a signed delta. Idempotent in the sense that the resulting
 * value is always derived from the stored value and clamped, so a double click
 * cannot push the counter out of range.
 * @param {"successes"|"failures"} track
 * @param {number} delta
 * @returns {Promise<Challenge|null>}
 */
export async function adjust(track, delta) {
  if (!assertGM()) return null;
  if (!["successes", "failures"].includes(track)) {
    logError(`Refusing to adjust unknown track "${track}".`);
    return null;
  }

  const current = getChallenge();
  if (!current.active) {
    ui.notifications.warn(game.i18n.localize("PVC.Notify.NoChallenge"));
    return null;
  }
  if (track === "failures" && !current.trackFailures) {
    ui.notifications.warn(game.i18n.localize("PVC.Notify.FailuresDisabled"));
    return null;
  }

  const value = clampInt(current[track] + Number(delta), 0, LIMITS.MAX_COUNT);
  if (value === current[track]) return current;

  const applied = value - current[track];
  const reason = game.i18n.format("PVC.Reason.Adjusted", {
    track: game.i18n.localize(track === "successes" ? "PVC.Successes" : "PVC.Failures"),
    delta: applied > 0 ? `+${applied}` : String(applied)
  });
  return setChallenge(
    {
      ...current,
      [track]: value,
      lastChange: { track, delta: applied, time: Date.now() }
    },
    { reason }
  );
}

/**
 * Set both counts explicitly.
 * @param {number} successes
 * @param {number} failures
 * @returns {Promise<Challenge|null>}
 */
export async function setCounts(successes, failures) {
  if (!assertGM()) return null;
  const current = getChallenge();
  if (!current.active) {
    ui.notifications.warn(game.i18n.localize("PVC.Notify.NoChallenge"));
    return null;
  }
  const nextSuccesses = clampInt(successes, 0, LIMITS.MAX_COUNT);
  const nextFailures = clampInt(failures, 0, LIMITS.MAX_COUNT);
  const successDelta = nextSuccesses - current.successes;
  const failureDelta = nextFailures - current.failures;

  // Attribute the footer line to whichever track actually moved.
  const track = successDelta !== 0 ? "successes" : failureDelta !== 0 ? "failures" : "";
  const delta = successDelta !== 0 ? successDelta : failureDelta;

  return setChallenge(
    {
      ...current,
      successes: nextSuccesses,
      failures: nextFailures,
      lastChange: track ? { track, delta, time: Date.now() } : current.lastChange
    },
    { reason: game.i18n.localize("PVC.Reason.CountsSet") }
  );
}

/**
 * Reset both counts to zero, keeping the challenge and its configuration.
 * @returns {Promise<Challenge|null>}
 */
export async function resetCounts() {
  if (!assertGM()) return null;
  const current = getChallenge();
  if (!current.active) {
    ui.notifications.warn(game.i18n.localize("PVC.Notify.NoChallenge"));
    return null;
  }
  const result = await setChallenge(
    { ...current, successes: 0, failures: 0, lastChange: { track: "", delta: 0, time: 0 } },
    { reason: game.i18n.localize("PVC.Reason.Reset") }
  );
  if (result) ui.notifications.info(game.i18n.localize("PVC.Notify.Reset"));
  return result;
}

/**
 * End the challenge and clear the counter from every screen.
 * The previous state remains available through {@link undo} until the next write.
 * @returns {Promise<Challenge|null>}
 */
export async function clearChallenge() {
  if (!assertGM()) return null;
  const result = await setChallenge(foundry.utils.deepClone(DEFAULT_CHALLENGE), {
    announce: false,
    reason: game.i18n.localize("PVC.Reason.Cleared")
  });
  if (result) ui.notifications.info(game.i18n.localize("PVC.Notify.Cleared"));
  return result;
}

/**
 * Flip whether players can see the counter. Bound to the eye button in the HUD
 * title bar; GM only, and it does not touch the counts.
 * @returns {Promise<Challenge|null>}
 */
export async function togglePlayerVisibility() {
  if (!assertGM()) return null;
  const current = getChallenge();
  if (!current.active) {
    ui.notifications.warn(game.i18n.localize("PVC.Notify.NoChallenge"));
    return null;
  }
  const visible = !current.visibleToPlayers;
  const result = await setChallenge(
    { ...current, visibleToPlayers: visible },
    { announce: false, reason: game.i18n.localize("PVC.Reason.Reconfigured") }
  );
  if (result) {
    ui.notifications.info(
      game.i18n.localize(visible ? "PVC.Notify.NowVisible" : "PVC.Notify.NowHidden")
    );
  }
  return result;
}

/**
 * Restore the single-level undo snapshot.
 * @returns {Promise<Challenge|null>}
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
  if (!buffer?.challenge) {
    ui.notifications.warn(game.i18n.localize("PVC.Notify.NothingToUndo"));
    return null;
  }
  const result = await setChallenge(buffer.challenge, {
    snapshot: false,
    announce: false,
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
    return Boolean(game.settings.get(MODULE_ID, SETTINGS.UNDO)?.challenge);
  } catch {
    return false;
  }
}

/* -------------------------------------------- */
/*  Announcements                               */
/* -------------------------------------------- */

/**
 * Post a chat card summarizing the new state, if the GM enabled chat updates.
 * The card is whispered to GMs when the challenge is hidden from players.
 * @param {Challenge} challenge
 * @param {Challenge} previous
 * @param {string}    [reason]
 * @returns {Promise<void>}
 */
async function postUpdateCard(challenge, previous, reason) {
  if (!game.user.isGM) return;
  if (!challenge.active) return;
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
        challenge,
        reason: reason ?? "",
        statusLabel: game.i18n.localize(`PVC.Status.${challenge.status}`),
        successDelta: challenge.successes - previous.successes,
        failureDelta: challenge.failures - previous.failures
      }
    );

    const data = { content, speaker: { alias: game.i18n.localize("PVC.Title") } };
    if (!challenge.visibleToPlayers) {
      data.whisper = ChatMessage.getWhisperRecipients("GM").map((u) => u.id);
    }
    await ChatMessage.create(data);
  } catch (err) {
    // A failed chat card must never block the state update itself.
    logError("Failed to post the challenge chat card.", err);
  }
}
