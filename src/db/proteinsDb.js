import {open} from '@op-engineering/op-sqlite';
import {PROTEINS_DB_NAME, SEED_PROTEINS} from '../constants';
import {extractMainProteins, normalizeDishName} from '../utils/protein';

// Schema versions, applied in order and tracked in PRAGMA user_version.
const MIGRATIONS = [
  async db => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS proteins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        normalized_name TEXT NOT NULL UNIQUE,
        first_seen_week TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await insertMissing(
      db,
      SEED_PROTEINS.map(name => ({name, normalizedName: normalizeDishName(name)})),
      null,
    );
  },
];

let dbPromise = null;

async function migrate(db) {
  const {rows} = await db.execute('PRAGMA user_version');
  const version = Number(rows[0]?.user_version ?? 0);
  for (let v = version; v < MIGRATIONS.length; v++) {
    await db.transaction(async tx => {
      await MIGRATIONS[v](tx);
      // PRAGMA doesn't take bound parameters; v is a trusted integer.
      await tx.execute(`PRAGMA user_version = ${v + 1}`);
    });
  }
}

function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = open({name: PROTEINS_DB_NAME});
      await migrate(db);
      return db;
    })().catch(error => {
      dbPromise = null; // let the next call retry instead of caching the failure
      throw error;
    });
  }
  return dbPromise;
}

function toProtein(row) {
  return {
    id: Number(row.id),
    name: row.name,
    normalizedName: row.normalized_name,
    firstSeenWeek: row.first_seen_week ?? null,
  };
}

// Inserts the proteins whose normalized name isn't stored yet and returns the
// ones that were actually added. `executor` is the db or an open transaction.
async function insertMissing(executor, proteins, weekKey) {
  const added = [];
  for (const {name, normalizedName} of proteins) {
    if (!normalizedName) {
      continue;
    }
    const result = await executor.execute(
      'INSERT OR IGNORE INTO proteins (name, normalized_name, first_seen_week) VALUES (?, ?, ?)',
      [name, normalizedName, weekKey],
    );
    if (result.rowsAffected > 0) {
      added.push({id: Number(result.insertId), name, normalizedName, firstSeenWeek: weekKey});
    }
  }
  return added;
}

// Every known protein, alphabetically (accents ignored).
export async function listProteins() {
  const db = await getDb();
  const {rows} = await db.execute(
    'SELECT id, name, normalized_name, first_seen_week FROM proteins ORDER BY normalized_name',
  );
  return rows.map(toProtein);
}

export async function getProteinById(id) {
  if (id === null || id === undefined) {
    return null;
  }
  const db = await getDb();
  const {rows} = await db.execute(
    'SELECT id, name, normalized_name, first_seen_week FROM proteins WHERE id = ?',
    [id],
  );
  return rows.length ? toProtein(rows[0]) : null;
}

// Adds this week's main dishes that aren't in the database yet. Returns the
// newly added proteins (empty when the week brought nothing new).
export async function syncWeekProteins(weekMenu, weekKey) {
  const proteins = extractMainProteins(weekMenu);
  if (!proteins.length) {
    return [];
  }
  const db = await getDb();
  let added = [];
  await db.transaction(async tx => {
    added = await insertMissing(tx, proteins, weekKey);
  });
  return added;
}

// Test-only: forget the open connection so the next call opens a fresh one.
export function __resetForTests() {
  dbPromise = null;
}
