'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

function extractNamedFunction(src, name) {
  const start = src.indexOf(`function ${name}`);
  assert.ok(start >= 0, `missing ${name}`);
  const brace = src.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`unclosed ${name}`);
}

const unlockSrc = fs.readFileSync(
  path.join(__dirname, '..', 'fire-s-finish-unlock.js'),
  'utf8'
);
const appSrc = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

assert.ok(
  /finishBtn\.disabled = false/.test(appSrc),
  'Finish Inspection must stay tappable'
);
assert.ok(
  /liveChecklistCounts/.test(appSrc),
  'Finish must count answers on the screen'
);
assert.ok(
  /fire-s-finish-unlock\.js/.test(
    fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8')
  ),
  'Finish unlock script must load in the app'
);

function makeSelect(value, hidden) {
  const row = {
    classList: {
      contains(name) {
        return hidden && name === 'fire-s-gate-hidden';
      },
      remove() {}
    },
    dataset: { sectionIndex: '0' },
    closest(selector) {
      if (selector === '.checklist-row') return row;
      if (selector === '.fire-s-gate-hidden') return hidden ? row : null;
      return null;
    },
    scrollIntoView() {}
  };
  return {
    value,
    closest(selector) {
      if (selector === '.checklist-row') return row;
      if (selector === '.fire-s-gate-hidden') return hidden ? row : null;
      return null;
    }
  };
}

const fields = [
  makeSelect('Yes', false),
  makeSelect('No', false),
  makeSelect('N/A', false),
  makeSelect('', false)
];

const sandbox = {
  window: {},
  document: {
    body: { classList: { contains() { return false; } } },
    getElementById() { return { disabled: true, textContent: '', title: '' }; },
    querySelectorAll(selector) {
      if (selector === '.answer-select') return fields;
      return [];
    },
    addEventListener() {}
  },
  alert() {}
};
sandbox.window = sandbox;
sandbox.window.document = sandbox.document;
sandbox.window.eval = () => {};

vm.runInNewContext(unlockSrc, sandbox);

assert.strictEqual(sandbox.fireSIsAnsweredChecklistValue('Yes'), true);
assert.strictEqual(sandbox.fireSIsAnsweredChecklistValue('Compliant'), false);
assert.strictEqual(sandbox.fireSIsAnsweredChecklistValue(''), false);
assert.strictEqual(sandbox.fireSLiveChecklistCompletion().unanswered, 1);
assert.strictEqual(sandbox.fireSLiveChecklistCompletion().answered, 3);

fields[3].value = 'Yes';
assert.strictEqual(sandbox.fireSLiveChecklistCompletion().unanswered, 0);

console.log('finish-inspection-unlock.test.js ok');
