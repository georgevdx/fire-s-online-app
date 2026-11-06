'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

function load(file) {
  const store = {};
  const sandbox = {
    window: {
      currentUserProfile: {
        email: 'georgevdx@gmail.com',
        fullName: 'George'
      }
    },
    document: {
      readyState: 'complete',
      getElementById() { return null; },
      addEventListener() {}
    },
    localStorage: {
      getItem(key) { return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null; },
      setItem(key, value) { store[key] = String(value); }
    },
    console
  };
  sandbox.window.localStorage = sandbox.localStorage;
  vm.runInNewContext(read(file), sandbox);
  return sandbox;
}

function check(file) {
  const sandbox = load(file);
  const visible = sandbox.window.fireSDashboardVisibleProjects;
  const hidden = sandbox.window.fireSDashboardHiddenPerson;
  assert.strictEqual(typeof visible, 'function', file + ' must export the dashboard filter');
  assert.strictEqual(hidden('johandb1974ik@gmail.com', 'JdB'), true);
  assert.strictEqual(hidden('georgevdx@gmail.com', 'George'), true);
  assert.strictEqual(hidden('sam@example.com', 'Sam'), false);

  const previous = [
    { id: 'old-jdb', inspectorName: 'JdB', inspectionDate: '2026-07-27' },
    { id: 'old-me', inspectorName: 'George', createdByEmail: 'georgevdx@gmail.com', inspectionDate: '2026-06-11' }
  ];
  assert.deepStrictEqual(visible(previous).map(project => project.id), []);

  const later = previous.concat([
    { id: 'new-sam', inspectorName: 'Sam', createdByEmail: 'georgevdx@gmail.com', inspectionDate: '2026-11-07' },
    { id: 'new-jdb', inspectorName: 'JdB', createdByEmail: 'johandb@live.com', inspectionDate: '2026-11-07' },
    { id: 'new-me', inspectorName: 'George', inspectionDate: '2026-11-07' }
  ]);
  assert.deepStrictEqual(visible(later).map(project => project.id), ['new-sam']);
}

check('fire-s-management-dashboard.js');
check('staging/fire-s-management-dashboard.js');

assert.ok(/fireSDashboardVisibleProjects/.test(read('fire-s-inspector-board.js')));
assert.ok(/fireSDashboardHiddenPerson/.test(read('fire-s-company-team.js')));
assert.ok(/fire-s-management-dashboard\.js\?v=1-22-clear-history/.test(read('index.html')));
assert.ok(/Version 1\.3\.67/.test(read('index.html')));
assert.ok(/Version 1\.3\.130-toets/.test(read('staging/index.html')));

console.log('management-dashboard-clear.test.js: ok');
