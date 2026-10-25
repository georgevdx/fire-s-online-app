'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function assertPopup(label, file) {
  const app = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const start = app.indexOf('function inspectionSavePopupDetail');
  const end = app.indexOf('function saveProject');
  assert.ok(start !== -1 && end > start, label + ': save popup helpers must sit above saveProject');
  const block = app.slice(start, end);
  assert.ok(block.includes("'Inspection Draft saved'"), label + ': Save Draft popup must say Inspection Draft saved');
  assert.ok(block.includes("'Completed inspection saved'"), label + ': Finish popup must say Completed inspection saved');
  assert.ok(!block.includes('Nothing has changed since the last save'), label + ': unchanged Save Draft must not say nothing changed');
  assert.ok(
    !block.includes('Fire-S will send it to the server automatically'),
    label + ': Finish popup must not be replaced by the device upload sentence'
  );
  assert.ok(app.includes('color:#0f172a !important'), label + ': popup heading must stay dark on the white card');
  assert.ok(
    app.includes("saveMessage.textContent = 'Inspection Draft saved'"),
    label + ': the line under Save Draft must say Inspection Draft saved'
  );
  assert.ok(
    app.includes("saveProject({ notify: 'draft', unchangedNotice: true })"),
    label + ': Save Draft must confirm without creating a second inspection'
  );
}

assertPopup('Toets', 'staging/app.js');
assertPopup('Live', 'app.js');

console.log('save-popup-wording.test.js: ok');
