const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
for (const script of ['Code.gs', 'Code-site2.gs']) {
  const source = fs.readFileSync(path.join(__dirname, '../google-sheet', script), 'utf8');
  const start = source.indexOf("    if (body.action === 'backup' || body.action === 'backup-file') {");
  const end = source.indexOf('\n    //', start + 10);
  const execute = new Function('body', 'out', 'Utilities', 'LockService', 'DriveApp', 'getOrCreateBackupFolder', source.slice(start, end));
  function run({ fail = false, object = false, corrupt = false } = {}) {
    let trashed = false, created = false, released = false;
    const old = { getBlob: () => ({ getDataAsString: () => 'old copy' }), setTrashed: () => { assert.ok(created); trashed = true; } };
    const folder = {
      getFilesByName: () => { let next = true; return { hasNext: () => next, next: () => { next = false; return old; } }; },
      createFile: blob => { if (fail) throw new Error('Drive full'); created = true; return { getSize: () => blob.bytes.length, getId: () => 'new', getUrl: () => 'test', setTrashed() {} }; },
      getFiles: () => ({ hasNext: () => false }),
    };
    const bytes = Buffer.from('sample file');
    const hash = crypto.createHash('sha256').update(bytes).digest('hex');
    const json = object ? { base64: bytes.toString('base64'), size: corrupt ? 1 : bytes.length } : { tables: { users: [] } };
    const body = { action: object ? 'backup-file' : 'backup', fileName: object ? hash + '.json' : 'cea-db-backup-2026-10-14.json', fileBase64: Buffer.from(JSON.stringify(json)).toString('base64') };
    const utilities = {
      base64Decode: value => Buffer.from(value, 'base64'),
      newBlob: bytes => ({ bytes, getDataAsString: () => bytes.toString() }),
      DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest: (algorithm, data) => [...crypto.createHash(algorithm).update(data).digest()],
    };
    let result, error;
    try { result = execute(body, x => x, utilities, { getScriptLock: () => ({ waitLock() {}, releaseLock() { released = true; } }) }, { getFoldersByName: () => ({ hasNext: () => true, next: () => folder }) }, () => folder); } catch (e) { error = e; }
    return { trashed, created, released, result, error };
  }
  test(script + ': failed create preserves previous backup and releases lock', () => {
    const result = run({ fail: true });
    assert.match(result.error.message, /Drive full/);
    assert.equal(result.trashed, false);
    assert.equal(result.released, true);
  });
  test(script + ': replacement succeeds after creating verified copy', () => {
    const result = run();
    assert.equal(result.result.ok, true);
    assert.equal(result.trashed, true);
  });
  test(script + ': file objects validate bytes before upload', () => {
    assert.equal(run({ object: true }).result.ok, true);
    const bad = run({ object: true, corrupt: true });
    assert.equal(bad.result.ok, false);
    assert.equal(bad.created, false);
  });
}
