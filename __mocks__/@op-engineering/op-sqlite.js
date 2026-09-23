// Jest stand-in for op-sqlite backed by Node's built-in SQLite (Node 22.13+),
// so the app's real SQL runs in tests. Databases live in memory, keyed by
// name, and survive re-opening (like the on-device file) until __resetAll().
let DatabaseSync;
try {
  ({DatabaseSync} = require('node:sqlite'));
} catch (error) {
  throw new Error(
    `The op-sqlite test mock needs node:sqlite (Node 22.13 or newer); running ${process.version}.`,
  );
}

// StatementSync#columns() only exists from Node 22.16; before that, tell
// row-returning statements apart by their SQL.
function returnsRows(statement, query) {
  if (typeof statement.columns === 'function') {
    return statement.columns().length > 0;
  }
  return /^\s*(SELECT|WITH|PRAGMA\s+\w+\s*$)|\bRETURNING\b/i.test(query);
}

const databases = new Map();
let openError = null;

function createDb() {
  const raw = new DatabaseSync(':memory:');

  const executeSync = (query, params = []) => {
    const statement = raw.prepare(query);
    if (returnsRows(statement, query)) {
      const rows = statement.all(...params).map(row => ({...row}));
      return {rows, rowsAffected: 0};
    }
    const {changes, lastInsertRowid} = statement.run(...params);
    return {rows: [], rowsAffected: Number(changes), insertId: Number(lastInsertRowid)};
  };
  const execute = async (query, params) => executeSync(query, params);

  const transaction = async fn => {
    let finalized = false;
    const commit = () => {
      finalized = true;
      return executeSync('COMMIT');
    };
    const rollback = () => {
      finalized = true;
      return executeSync('ROLLBACK');
    };
    executeSync('BEGIN TRANSACTION');
    try {
      await fn({execute, commit, rollback});
      if (!finalized) {
        commit();
      }
    } catch (error) {
      if (!finalized) {
        rollback();
      }
      throw error;
    }
  };

  return {execute, executeSync, transaction, close: () => raw.close()};
}

function open({name}) {
  if (openError) {
    throw openError;
  }
  if (!databases.has(name)) {
    databases.set(name, createDb());
  }
  return databases.get(name);
}

module.exports = {
  open,
  __resetAll: () => {
    databases.clear();
    openError = null;
  },
  __setOpenError: error => {
    openError = error;
  },
};
