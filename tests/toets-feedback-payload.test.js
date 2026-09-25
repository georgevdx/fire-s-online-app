'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const app = read('staging/app.js');
const html = read('staging/index.html');
const env = read('staging/fire-s-env.js');
const bootstrap = read('STAGING_BOOTSTRAP.sql');

assert.ok(
  /Version 1\.3\.114-toets/.test(html) &&
    /appVersion: staging \? '1\.3\.114-toets'/.test(env) &&
    /app\.js\?v=1-3-114-hide-pw/.test(html) &&
    /fireS\.toetsCacheDrop\.1-3-118/.test(html),
  'Toets must cache-bust the Fire-S Test feedback payload fix as 1.3.114-toets'
);

assert.ok(
  /create table if not exists public\.beta_feedback \(/.test(bootstrap) &&
    /payload jsonb/.test(bootstrap.slice(bootstrap.indexOf('create table if not exists public.beta_feedback'))),
  'Fire-S Test beta_feedback stores comments in payload jsonb'
);

assert.ok(
  /function unwrapBetaFeedbackRow\(/.test(app) &&
    /function betaFeedbackInsertRow\(/.test(app) &&
    /function loadBetaFeedbackRows\(/.test(app) &&
    /payload: fields/.test(app) &&
    /select\('\*'\)/.test(app.match(/async function loadBetaFeedbackRows[\s\S]*?async function submitBetaFeedback/)[0]) &&
    /insert\(betaFeedbackInsertRow\(payload\)\)/.test(app) &&
    /await loadBetaFeedbackRows\(100\)/.test(app) &&
    /await loadBetaFeedbackRows\(50\)/.test(app) &&
    /Could not load feedback comments\. Please try again/.test(app),
  'Toets must save and load comments through payload jsonb, not live app_version columns'
);

const start = app.indexOf('function unwrapBetaFeedbackRow(row) {');
const end = app.indexOf('function betaFeedbackInsertRow(fields) {');
assert.ok(start >= 0 && end > start, 'unwrap helper must exist');
const sandbox = {};
vm.runInNewContext(
  app.slice(start, end) +
    'this.unwrapBetaFeedbackRow = unwrapBetaFeedbackRow;\n',
  sandbox
);
const row = sandbox.unwrapBetaFeedbackRow({
  id: 'abc',
  status: 'new',
  created_at: '2026-09-23T19:00:00.000Z',
  payload: {
    issue_type: 'Comment',
    what_happened: 'The dark theme is hard to read',
    app_version: '1.3.114-toets',
    reported_by_email: 'owner@example.com'
  }
});
assert.strictEqual(row.issue_type, 'Comment');
assert.strictEqual(row.what_happened, 'The dark theme is hard to read');
assert.strictEqual(row.app_version, '1.3.114-toets');
assert.strictEqual(row.reported_by_email, 'owner@example.com');

const insertStart = app.indexOf('function betaFeedbackInsertRow(fields) {');
const insertEnd = app.indexOf('async function loadBetaFeedbackRows(limit) {');
const insertBox = { fireSStaging: true };
vm.runInNewContext(
  app.slice(insertStart, insertEnd) +
    'this.betaFeedbackInsertRow = betaFeedbackInsertRow;\n',
  insertBox
);
const packed = insertBox.betaFeedbackInsertRow({
  issue_type: 'Comment',
  what_happened: 'ok',
  status: 'new'
});
assert.strictEqual(packed.status, 'new');
assert.strictEqual(packed.payload.issue_type, 'Comment');
assert.ok(!Object.prototype.hasOwnProperty.call(packed, 'app_version'));

console.log('toets-feedback-payload.test.js: ok');
