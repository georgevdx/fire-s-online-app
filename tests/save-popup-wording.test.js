'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const app = fs.readFileSync(path.join(__dirname, '..', 'staging', 'app.js'), 'utf8');
const start = app.indexOf('function inspectionSavePopupDetail');
const end = app.indexOf('function saveProject');
assert.ok(start !== -1 && end > start, 'Save popup helpers must sit above saveProject');
const block = app.slice(start, end);

assert.ok(block.includes("'Inspection Draft saved'"), 'Save Draft popup must say Inspection Draft saved');
assert.ok(block.includes("'Completed inspection saved'"), 'Finish popup must say Completed inspection saved');
assert.ok(!block.includes('Nothing has changed since the last save'), 'Unchanged Save Draft must not say nothing changed');
assert.ok(
  !block.includes('Fire-S will send it to the server automatically'),
  'Finish popup must not be replaced by the device upload sentence'
);
assert.ok(
  app.includes('color:#0f172a !important'),
  'Save popup heading must stay dark on the white card in dark mode'
);
assert.ok(
  app.includes("saveMessage.textContent = 'Inspection Draft saved'"),
  'The line under Save Draft must say Inspection Draft saved'
);

console.log('save-popup-wording.test.js: ok');
