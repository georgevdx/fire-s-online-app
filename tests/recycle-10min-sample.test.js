'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const html = read('staging/index.html');
const liveHtml = read('index.html');
const samplesSrc = read('staging/fire-s-test-samples.js');
const liveSamplesSrc = read('fire-s-test-samples.js');
const app = read('staging/app.js');
const liveApp = read('app.js');

assert.ok(
  /id="testSamplesRecycle10MinBtn"/.test(html) &&
    /Load 10-min Recycle Bin sample/.test(html) &&
    /fire-s-test-samples\.js\?v=1-5-recycle10/.test(html) &&
    /app\.js\?v=1-3-63-login-fast/.test(html),
  'Toets-blad must offer the 10-min Recycle Bin sample'
);
assert.ok(
  !/id="testSamplesRecycle10MinBtn"/.test(liveHtml) &&
    !/Load 10-min Recycle Bin sample/.test(liveHtml) &&
    !/fires-test-sample-recycle-10min/.test(liveSamplesSrc),
  'Live must not ship the 10-min Recycle Bin sample'
);
assert.ok(
  /function buildRecycle10MinSample\(/.test(samplesSrc) &&
    /RECYCLE_10MIN_MS = 10 \* 60 \* 1000/.test(samplesSrc) &&
    /fireSLoadRecycle10MinSample/.test(samplesSrc),
  'Toets samples must build a 10-minute Recycle Bin expiry item'
);
assert.ok(
  /function retentionRemainingText\(item\)/.test(app) &&
    /min remaining/.test(app) &&
    /function armSoonExpireWatcher\(\)/.test(app) &&
    /fireSLoadRecycle10MinSample/.test(app) &&
    /Load 10-min expiry sample/.test(app),
  'Toets Recycle Bin must show a minute countdown and auto-refresh before 10-min expiry'
);
assert.ok(
  /function armSoonExpireWatcher\(\)/.test(liveApp) &&
    !/Load 10-min expiry sample/.test(liveApp) &&
    !/fireSLoadRecycle10MinSample/.test(liveApp),
  'Live Recycle Bin auto-purges after 30 days, but must not include the 10-min toets sample'
);

const samples = require(path.join(__dirname, '..', 'staging', 'fire-s-test-samples.js'));
const now = Date.now();
const sample = samples.buildRecycle10MinSample({
  companyId: 'co-1',
  companyName: 'Company S',
  userId: 'owner-1',
  userEmail: 'owner@example.com'
});

assert.strictEqual(sample.id, samples.RECYCLE_10MIN_ID);
assert.ok(samples.isTestSample(sample), '10-min sample must delete with the test batch');
assert.ok(
  /TEST · Recycle 10-min expiry/.test(sample.organisationName),
  'Sample premises must be labelled as the 10-min Recycle test'
);

const item = sample.recycleBin.historyInspections[0];
assert.ok(item, 'Sample must place one history inspection in the Recycle Bin');
assert.strictEqual(item.recycleId, samples.RECYCLE_10MIN_ID + '-hist');

const purgeAt = new Date(item.purgeAfter).getTime();
const deletedAt = new Date(item.deletedAt).getTime();
assert.ok(Number.isFinite(purgeAt) && Number.isFinite(deletedAt));
assert.ok(
  Math.abs(purgeAt - now - samples.RECYCLE_10MIN_MS) < 5000,
  'purgeAfter must be about 10 minutes from now'
);
assert.ok(
  Math.abs(deletedAt - (now - 30 * 24 * 60 * 60 * 1000)) < 5000,
  'deletedAt must look like a 30-day Recycle Bin item'
);
assert.ok(
  sample.inspectionHistory && sample.inspectionHistory.length > 0,
  'Premises must keep a live history record after the Recycle item expires'
);

console.log('recycle-10min-sample.test.js: ok');
