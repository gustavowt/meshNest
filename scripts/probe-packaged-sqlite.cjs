/**
 * Packaging probe: verify packaged better-sqlite3 and sqlite-vec
 * load and execute inside the packaged Electron artifact (release/mac/meshNest.app).
 *
 * Usage:
 *   ELECTRON_RUN_AS_NODE=1 ./release/mac/meshNest.app/Contents/MacOS/meshNest scripts/probe-packaged-sqlite.cjs
 */
const path = require('node:path');

const mod = process.versions.modules;
const electronVer = process.versions.electron;

try {
  const unpackedNodeModules = path.resolve(
    'release/mac/meshNest.app/Contents/Resources/app.asar.unpacked/node_modules'
  );
  const bs3Path = path.join(unpackedNodeModules, 'better-sqlite3');
  const Database = require(bs3Path);

  const db = new Database(':memory:');
  const row = db.prepare('SELECT 1 as val').get();

  let vecOk = false;
  let vecError = null;
  try {
    const sqliteVec = require(path.join(unpackedNodeModules, 'sqlite-vec'));
    sqliteVec.load(db);
    db.exec('CREATE VIRTUAL TABLE test_vec USING vec0(embedding float[4])');
    vecOk = true;
  } catch (err) {
    vecError = String(err);
  }

  const result = {
    abi: mod,
    electron: electronVer,
    ok: true,
    betterSqlite3: {
      loaded: true,
      val: row.val,
    },
    sqliteVec: {
      loaded: vecOk,
      error: vecError,
    },
    error: null,
  };
  console.log(JSON.stringify(result));
  process.exit(0);
} catch (err) {
  const result = {
    abi: mod,
    electron: electronVer,
    ok: false,
    betterSqlite3: {
      loaded: false,
    },
    error: String(err),
  };
  console.log(JSON.stringify(result));
  process.exit(1);
}
