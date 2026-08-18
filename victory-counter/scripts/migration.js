/**
 * Versioned migration of stored track data.
 *
 * Two things happen here, and they are deliberately separate:
 *
 * 1. {@link migrateTrackData} is a *pure* function run on every read, on every
 *    client. It shapes whatever is in the world setting into the current schema
 *    in memory. Players therefore see correct data even before a GM has been
 *    online to persist the migration, and a malformed record degrades to a safe
 *    default instead of throwing.
 * 2. {@link runMigration} is the *persisting* pass. It runs once per world, GM
 *    only, writes a verbatim backup of the pre-migration array first, and is
 *    idempotent: re-running it against already-migrated data is a no-op.
 *
 * A third pass, {@link importLegacyModuleData}, runs before both of the above.
 * It carries a world's tracks over from the pre-4.0 `pf2e-victory-counter`
 * module id, which Foundry treats as a completely separate settings namespace.
 *
 * Nothing here deletes a world flag, a setting, or a track record.
 *
 * @module victory-counter/migration
 */

import {
  LEGACY_MODULE_ID,
  LIMITS,
  MODULE_ID,
  SCHEMA_VERSION,
  SETTINGS,
  TRACK_TYPES,
  log,
  logError
} from "./constants.js";

/** Keys that only ever existed on a pre-3.0 track. */
const LEGACY_KEYS = Object.freeze([
  "successes",
  "failures",
  "requiredSuccesses",
  "requiredFailures",
  "trackFailures"
]);

/**
 * Pick the legacy fields out of a raw record, or null when none are present.
 * @param {object} raw
 * @returns {object|null}
 */
function collectLegacyFields(raw) {
  const kept = {};
  for (const key of LEGACY_KEYS) {
    if (raw?.[key] !== undefined) kept[key] = raw[key];
  }
  return Object.keys(kept).length ? kept : null;
}

/**
 * The first finite number in the argument list, or the fallback.
 * Used so a v3 field always wins over its v2 equivalent.
 * @param {...any} values Candidate values; the last one is the fallback.
 * @returns {number}
 */
function firstNumber(...values) {
  const fallback = values.pop();
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

/* -------------------------------------------- */
/*  Import from the pre-4.0 module id           */
/* -------------------------------------------- */

/**
 * Read a world-scoped setting belonging to the old module id.
 *
 * `game.settings.get` cannot be used: it only resolves keys that were
 * registered this session, and the 3.x module is not installed any more. The
 * Setting documents themselves are still in the world database, so the value is
 * read straight out of the world settings collection instead.
 *
 * Read-only by construction — nothing in this file writes to the old namespace.
 *
 * @param {string} key Unqualified setting key, e.g. `"tracks"`.
 * @returns {any} The stored value, or undefined when the setting was never written.
 */
function readLegacyWorldSetting(key) {
  const storage = game.settings?.storage?.get?.("world");
  if (!storage) return undefined;

  const qualified = `${LEGACY_MODULE_ID}.${key}`;
  const doc =
    storage.getSetting?.(qualified) ??
    (typeof storage.find === "function"
      ? storage.find((setting) => setting?.key === qualified)
      : undefined);
  if (!doc) return undefined;

  // Setting documents persist their value as a JSON string. Older cores and
  // some shims hand back an already-parsed value, so both are accepted.
  const raw = doc.value;
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/**
 * Copy track data over from the pre-4.0 `pf2e-victory-counter` module id, once
 * per world.
 *
 * Foundry namespaces settings by module id, so renaming the module to drop its
 * system prefix would otherwise present every existing world as empty. This
 * runs before {@link runMigration} and is deliberately conservative:
 *
 * - GM only, and exactly once — the latch is set even when nothing is found.
 * - Never overwrites: if this module already has tracks of its own, the import
 *   is skipped and only the latch is written.
 * - Never deletes: the old settings are read and left exactly as they were, so
 *   reinstalling the 3.x module recovers the original world unchanged.
 *
 * @param {(raw: any) => object[]} sanitizeTracks Injected to avoid a circular
 *   import with the state layer.
 * @returns {Promise<boolean>} Whether tracks were imported.
 */
export async function importLegacyModuleData(sanitizeTracks) {
  if (!game.user.isGM) return false;

  try {
    if (game.settings.get(MODULE_ID, SETTINGS.IMPORTED_LEGACY_MODULE) === true) return false;
  } catch (err) {
    logError("Could not read the legacy import latch; skipping the import.", err);
    return false;
  }

  /** Set the latch so the lookup is not repeated on every load. */
  const latch = async () => {
    try {
      await game.settings.set(MODULE_ID, SETTINGS.IMPORTED_LEGACY_MODULE, true);
    } catch (err) {
      logError("Could not record that the legacy import has run.", err);
    }
  };

  // Anything already stored under the new id wins. A world that has started
  // using this module must never have its tracks replaced by stale ones.
  let existing;
  try {
    existing = game.settings.get(MODULE_ID, SETTINGS.TRACKS);
  } catch (err) {
    logError("Could not read current track data; skipping the legacy import.", err);
    return false;
  }
  if (Array.isArray(existing) && existing.length) {
    log("Legacy import: this world already has tracks; leaving them alone.");
    await latch();
    return false;
  }

  const legacyTracks = readLegacyWorldSetting(SETTINGS.TRACKS);
  if (!Array.isArray(legacyTracks) || !legacyTracks.length) {
    log(`Legacy import: no data found under "${LEGACY_MODULE_ID}".`);
    await latch();
    return false;
  }

  const legacySchema = Number(readLegacyWorldSetting(SETTINGS.SCHEMA)) || 0;

  // Back up the imported array verbatim before it is reshaped, for the same
  // reason the schema migration does: the source namespace is not ours to
  // depend on, and a hand-repair should not have to go looking for it.
  try {
    const backup = game.settings.get(MODULE_ID, SETTINGS.LEGACY_BACKUP);
    if (!Array.isArray(backup?.tracks)) {
      await game.settings.set(MODULE_ID, SETTINGS.LEGACY_BACKUP, {
        schema: legacySchema,
        tracks: foundry.utils.deepClone(legacyTracks),
        timestamp: Date.now(),
        source: LEGACY_MODULE_ID
      });
    }
  } catch (err) {
    logError("Could not back up the imported legacy track data.", err);
  }

  // sanitizeTracks migrates each record on the way through, so a world coming
  // from a 1.x or 2.x install lands on the current schema in this single step.
  const imported = sanitizeTracks(legacyTracks);

  try {
    await game.settings.set(MODULE_ID, SETTINGS.TRACKS, imported);
    await game.settings.set(MODULE_ID, SETTINGS.SCHEMA, SCHEMA_VERSION);
  } catch (err) {
    logError("Failed to import track data from the previous module id.", err);
    ui.notifications.error(game.i18n.localize("PVC.Notify.LegacyImportFailed"));
    return false;
  }

  await latch();

  log("Legacy import summary", {
    from: LEGACY_MODULE_ID,
    schema: legacySchema,
    records: legacyTracks.length,
    imported: imported.length,
    dropped: Math.max(0, legacyTracks.length - imported.length)
  });

  if (imported.length) {
    ui.notifications.info(
      game.i18n.format("PVC.Notify.LegacyImported", { count: imported.length })
    );
  }

  return imported.length > 0;
}

/**
 * Migrate one raw stored record to the current schema, without sanitizing it.
 * Sanitization (clamping, id assignment, status derivation) happens afterwards
 * in `state.sanitizeTrack`, so this function only has to get the *shape* right.
 *
 * Idempotent: a record already at {@link SCHEMA_VERSION} passes through with its
 * `current`, `target`, `type` and `legacy` values untouched.
 *
 * @param {any} raw
 * @returns {object} A record in the current shape.
 */
export function migrateTrackData(raw) {
  // A non-object (null, a string, a stray number) cannot be repaired field by
  // field. Return an empty record and let sanitization supply every default.
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  const stored = Number(raw.schema);
  const version = Number.isFinite(stored) ? stored : 0;
  const migrated = { ...raw };

  if (version < SCHEMA_VERSION) {
    // --- v0/v1/v2 -> v3 ---------------------------------------------------
    // The success pair becomes the only pair. Failure data is not representable
    // in the new model, so it is preserved verbatim under `legacy` rather than
    // being silently dropped.
    migrated.current = firstNumber(raw.current, raw.successes, 0);
    migrated.target = firstNumber(raw.target, raw.requiredSuccesses, 6);
    migrated.legacy = raw.legacy ?? collectLegacyFields(raw);

    // A pre-3.0 "lost" status has no equivalent; recompute from the counts.
    delete migrated.status;
  }

  // Polarity: honour an explicitly stored value, otherwise default to positive.
  // Applied at every version so a hand-edited or partially written record still
  // lands on a valid polarity.
  migrated.type = Object.values(TRACK_TYPES).includes(raw.type)
    ? raw.type
    : TRACK_TYPES.POSITIVE;

  // Legacy failure fields are no longer part of the schema. They survive inside
  // `legacy`; leaving copies at the top level would resurrect on every merge.
  for (const key of LEGACY_KEYS) delete migrated[key];

  migrated.schema = SCHEMA_VERSION;
  return migrated;
}

/**
 * Whether any record in the stored array still predates the current schema.
 * @param {any} raw
 * @returns {boolean}
 */
export function needsMigration(raw) {
  if (!Array.isArray(raw)) return false;
  return raw.some((entry) => Number(entry?.schema) !== SCHEMA_VERSION);
}

/**
 * Run the persisting migration pass. GM only; safe to call on every `ready`.
 *
 * @param {(raw: any) => object[]} sanitizeTracks Injected to avoid a circular
 *   import with the state layer, which owns clamping and status derivation.
 * @returns {Promise<boolean>} Whether anything was written.
 */
export async function runMigration(sanitizeTracks) {
  if (!game.user.isGM) return false;

  let raw;
  let storedVersion;
  try {
    raw = game.settings.get(MODULE_ID, SETTINGS.TRACKS);
    storedVersion = Number(game.settings.get(MODULE_ID, SETTINGS.SCHEMA)) || 0;
  } catch (err) {
    logError("Could not read track data for migration; leaving it untouched.", err);
    return false;
  }

  const list = Array.isArray(raw) ? raw : [];
  const stale = needsMigration(list);

  if (!stale && storedVersion === SCHEMA_VERSION) {
    log("Migration: already at schema", SCHEMA_VERSION, "- nothing to do.");
    return false;
  }

  // --- Back up the pre-migration array, once ------------------------------
  // Written before the tracks setting so a failure between the two writes
  // leaves the backup ahead of the data, never behind it.
  if (stale && list.length) {
    try {
      const existing = game.settings.get(MODULE_ID, SETTINGS.LEGACY_BACKUP);
      if (!Array.isArray(existing?.tracks)) {
        await game.settings.set(MODULE_ID, SETTINGS.LEGACY_BACKUP, {
          schema: storedVersion,
          tracks: foundry.utils.deepClone(list),
          timestamp: Date.now()
        });
      }
    } catch (err) {
      // A missing backup must not stop the migration; the original array is
      // still intact at this point and the migration itself is non-destructive.
      logError("Could not write the pre-migration backup.", err);
    }
  }

  const migrated = sanitizeTracks(list);

  try {
    await game.settings.set(MODULE_ID, SETTINGS.TRACKS, migrated);
    await game.settings.set(MODULE_ID, SETTINGS.SCHEMA, SCHEMA_VERSION);
  } catch (err) {
    logError("Failed to persist migrated track data.", err);
    ui.notifications.error(game.i18n.localize("PVC.Notify.MigrationFailed"));
    return false;
  }

  // Concise summary, debug builds only (log() is gated on the debug setting).
  log("Migration summary", {
    from: storedVersion,
    to: SCHEMA_VERSION,
    records: list.length,
    migrated: migrated.length,
    dropped: Math.max(0, list.length - migrated.length),
    carriedLegacyFields: migrated.filter((t) => t.legacy).length,
    backedUp: stale && list.length > 0,
    cap: LIMITS.MAX_TRACKS
  });

  return true;
}
