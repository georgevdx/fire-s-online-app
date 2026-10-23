'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const stagingApp = fs.readFileSync(path.join(__dirname, '..', 'staging', 'app.js'), 'utf8');
const start = stagingApp.indexOf('function fireSStorageQuotaError');
const end = stagingApp.indexOf('function setProjects(projects)');
assert.ok(start > 0 && end > start, 'quota save helpers must sit in front of setProjects');

function makeStorage(limit) {
  const mem = {
    snap: 'S'.repeat(500),
    fireyesaLastBackupJson: 'B'.repeat(500)
  };
  return {
    mem: mem,
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(mem, key) ? mem[key] : null;
    },
    removeItem(key) {
      delete mem[key];
    },
    setItem(key, value) {
      const next = Object.assign({}, mem);
      next[key] = String(value);
      const total = Object.keys(next).reduce((sum, name) => sum + String(next[name]).length, 0);
      if (total > limit) {
        const error = new Error(
          "Failed to execute 'setItem' on 'Storage': Setting the value of '" +
            key +
            "' exceeded the quota."
        );
        error.name = 'QuotaExceededError';
        error.code = 22;
        throw error;
      }
      mem[key] = String(value);
    }
  };
}

function loadHelpers(localStorage) {
  const sandbox = {
    localStorage: localStorage,
    stripHeavyPhotoDataFromProjects(projects) {
      return (projects || []).map(project => Object.assign({}, project, { photos: [] }));
    },
    fireSDeviceSnapshotKey() {
      return 'snap';
    },
    console: console
  };
  vm.runInNewContext(
    stagingApp.slice(start, end) +
      '\nthis.fireSStoreProjectsFittingQuota = fireSStoreProjectsFittingQuota;\n' +
      'this.fireSStorageQuotaError = fireSStorageQuotaError;',
    sandbox
  );
  return sandbox;
}

const storage = makeStorage(900);
const helpers = loadHelpers(storage);
const huge = 'data:image/jpeg;base64,' + 'A'.repeat(2000);
const saved = helpers.fireSStoreProjectsFittingQuota('fireyeProjects-staging', [
  {
    id: 'site-1',
    organisationName: 'Toets Logo',
    siteName: 'Site',
    inspectionDate: '2026-10-22',
    answers: [{ itemNumber: '1', answer: 'Yes' }],
    photos: [{ id: 'p1', src: huge, previewSrc: 'data:image/jpeg;base64,thumb' }]
  }
]);
const raw = storage.getItem('fireyeProjects-staging');
assert.ok(raw && raw.indexOf('Toets Logo') !== -1, 'the inspection name must be stored');
assert.ok(raw.indexOf('Yes') !== -1, 'the checklist answer must be stored');
assert.ok(raw.indexOf(huge) === -1, 'the oversized photo must not be written into the phone store');
assert.strictEqual(saved[0].organisationName, 'Toets Logo');
assert.strictEqual(storage.getItem('snap'), null, 'the extra snapshot copy must be dropped when the phone is full');
assert.strictEqual(storage.getItem('fireyesaLastBackupJson'), null);

const unnamed = new Error('exceeded the quota');
unnamed.code = 22;
assert.strictEqual(helpers.fireSStorageQuotaError(unnamed), true);

console.log('phone-storage-quota.test.js: ok');
