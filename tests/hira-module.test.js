'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const sandbox = {
  localStorage: {
    _data: {},
    getItem(key) { return Object.prototype.hasOwnProperty.call(this._data, key) ? this._data[key] : null; },
    setItem(key, value) { this._data[key] = String(value); }
  }
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(read('staging/fire-s-hira.js'), sandbox);
const hira = sandbox.fireSHira;

assert.strictEqual(hira.score(4, 4), 16);
assert.strictEqual(hira.score(1, 4), 4);
assert.strictEqual(hira.band(16), 'High');
assert.strictEqual(hira.band(4), 'Low');
assert.strictEqual(hira.band(9), 'Moderate');
assert.strictEqual(hira.band(10), 'High');
assert.strictEqual(hira.band(17), 'Critical');
assert.strictEqual(hira.band(25), 'Critical');
assert.strictEqual(hira.responseFor(4), 'Maintain controls');
assert.strictEqual(hira.responseFor(9), 'Monitor and improve where reasonably practicable');
assert.strictEqual(hira.responseFor(16), 'Further controls required; management attention');
assert.strictEqual(hira.responseFor(25), 'Activity not to proceed until risk is reduced');
assert.strictEqual(hira.LIBRARY.length, 18);
assert.ok(hira.LIBRARY.some(function (item) { return item.name === 'Ergonomic'; }));
assert.ok(hira.LIBRARY.some(function (item) { return item.name === 'Confined Spaces'; }));
assert.strictEqual(hira.HIERARCHY.join('|'), 'Eliminate|Substitute|Engineering|Administrative|PPE');

const blank = hira.blankAssessment([]);
assert.match(blank.number, /^HIRA-\d{4}-\d{3}$/);
assert.strictEqual(blank.type, 'baseline');
assert.strictEqual(blank.status, 'draft');
assert.strictEqual(blank.hazards.length, 1);

const summary = hira.summarise([{
  status: 'active',
  hazards: [{
    initialL: 4,
    initialS: 4,
    residualL: 1,
    residualS: 4,
    actions: [{ status: 'Open', target: '2000-01-01' }]
  }]
}]);
assert.strictEqual(summary.activeHazards, 1);
assert.strictEqual(summary.counts.Low, 1);
assert.strictEqual(summary.initialSum, 16);
assert.strictEqual(summary.residualSum, 4);
assert.strictEqual(summary.reduction, 75);
assert.strictEqual(summary.open, 1);
assert.strictEqual(summary.overdue, 1);

const stagingHtml = read('staging/index.html');
const liveHtml = read('index.html');
assert.ok(/id="cmdHiraBtn"/.test(stagingHtml), 'Toets Home must offer OHS HIRA');
assert.ok(/id="fireSHiraSection"/.test(stagingHtml) && /id="fireSHiraRoot"/.test(stagingHtml));
assert.ok(/fire-s-hira\.js\?v=1-0-hira/.test(stagingHtml));
assert.ok(/fire-s-hira\.css\?v=1-0-hira/.test(stagingHtml));
assert.ok(!/id="cmdHiraBtn"/.test(liveHtml) && !/fire-s-hira\.js/.test(liveHtml), 'Live must not load the HIRA module');

const roles = read('staging/fire-s-clean-home-roles.js');
assert.ok(/'cmdHiraBtn'/.test(roles));
assert.ok(/hide\('cmdHiraBtn'\)/.test(roles));
assert.ok(!/'cmdHiraBtn'/.test(read('fire-s-clean-home-roles.js')));

console.log('hira-module.test.js: ok');
