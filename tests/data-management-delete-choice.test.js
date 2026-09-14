'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const app = read('staging/app.js');
const html = read('staging/index.html');
const start = app.indexOf('(function installFireSDataManagementV12(){');
const end = app.indexOf('window.fireSPurgeExpiredRecycleAutomatically');
assert.ok(start >= 0 && end > start, 'Data Management panel must exist');
const panel = app.slice(start, end);

assert.ok(
  /function projectsStorageKey\(/.test(panel) &&
    /localStorage.getItem\(projectsStorageKey\(\)\)/.test(panel),
  'Delete buttons must read fireyeProjects-staging on toets, not live fireyeProjects'
);
assert.ok(
  !/getItem\('fireyeProjects'\)/.test(panel),
  'Data Management must not hard-code the live projects key'
);
assert.ok(
  /Recycle Bin \(30 days\)/.test(panel) &&
    /Delete immediately/.test(panel),
  'Each delete must offer Recycle Bin or Delete immediately'
);
assert.ok(
  /mode === 'immediate'/.test(panel) &&
    /immediate_delete_current_inspection/.test(panel) &&
    /immediate_delete_history_inspection/.test(panel) &&
    /immediate_delete_entire_premises/.test(panel),
  'Immediate delete must skip the Recycle Bin'
);
assert.ok(
  /async function purgeExpiredRecycleAutomatically\(/.test(panel) &&
    /deleted automatically/.test(panel),
  'Recycle Bin items must be purged automatically after 30 days'
);
assert.ok(
  /restoreRecycleId \|\| button.dataset.recycleId/.test(panel),
  'Recycle restore must read the restore button id'
);
assert.ok(
  /z-index:60050/.test(panel),
  'Data Management must sit above Command Centre so its buttons receive taps'
);
assert.ok(
  /delete-data-management-v16/.test(panel) &&
    /function wireChoice\(/.test(panel),
  'Delete confirm panels must wire Recycle and Immediate actions'
);
assert.ok(
  /app\.js\?v=1-3-78-toets-datadel/.test(html) &&
    /Version 1\.3\.78-toets/.test(html),
  'Toets must cache-bust Data Management delete without bumping the displayed version'
);

console.log('data-management-delete-choice.test.js: ok');
