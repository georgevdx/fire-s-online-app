'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const liveApp = read('app.js');
const stagingApp = read('staging/app.js');
const liveStarted = read('fire-s-get-started.js');
const stagingStarted = read('staging/fire-s-get-started.js');
const stagingLock = read('staging/fire-s-screen-lock.js');
const stagingHtml = read('staging/index.html');
const liveHtml = read('index.html');

assert.ok(
  !/function isInspectionFormOpen\(/.test(liveApp) &&
    !/__fireSOpeningInspection/.test(liveApp),
  'Live must not get the new-inspection stay fix yet'
);
assert.ok(
  !/if \(userLeftHome\(\)\) return;/.test(liveStarted),
  'Live delayed Home paint must stay as-is until the inspection stay is sat live'
);

assert.ok(
  /function isInspectionFormOpen\(/.test(stagingApp) &&
    /if \(isInspectionFormOpen\(\)\) return false;/.test(stagingApp) &&
    /form\.hidden = false/.test(stagingApp) &&
    /__fireSOpeningInspection/.test(stagingApp),
  'Toets-blad must keep a new inspection on screen'
);
assert.ok(
  /function userLeftHome\(/.test(stagingStarted) &&
    /if \(userLeftHome\(\)\) return;/.test(stagingStarted),
  'Toets delayed Home paint must not run on Gateway or a new inspection'
);
assert.ok(
  /function inlineOpen\(el\)/.test(stagingLock) &&
    /__fireSOpeningInspection/.test(stagingLock),
  'Toets blank-home recover must keep a new inspection on screen'
);
assert.ok(
  /app\.js\?v=1-3-76-toets-noreports/.test(stagingHtml) &&
    /fire-s-screen-lock\.js\?v=1-7-new-insp/.test(stagingHtml),
  'Toets-blad must cache-bust the new-inspection stay fix'
);
assert.ok(
  !/1-3-76-ver/.test(liveHtml) && !/1-7-new-insp/.test(liveHtml),
  'Live cache tags must not include the toets-only inspection stay'
);

function makeEl(id, display) {
  const attrs = {};
  const style = {
    display,
    visibility: '',
    opacity: '',
    pointerEvents: '',
    setProperty(name, value) {
      this[name] = value;
    },
    removeProperty(name) {
      this[name] = '';
    }
  };
  return {
    id,
    hidden: false,
    style,
    classList: { add() {}, remove() {}, contains() { return false; } },
    setAttribute(name, value) { attrs[name] = value; },
    getAttribute(name) { return attrs[name]; },
    removeAttribute(name) { delete attrs[name]; }
  };
}

const workspaceIds = [
  'homeSection',
  'projectListSection',
  'projectFormSection',
  'servicesSection',
  'findingsCentreSection',
  'companyTeamSection',
  'companyLetterheadSection',
  'testSamplesSection',
  'inspectorBoardSection',
  'userManualSection',
  'managementDashboardSection',
  'reportSection',
  'mainCommandCentre'
];

function loadLock() {
  const els = {};
  workspaceIds.forEach(id => {
    els[id] = makeEl(id, 'none');
  });
  const bodyClasses = new Set();
  const sandbox = {
    MutationObserver: class { observe() {} },
    setTimeout() {},
    clearTimeout() {},
    requestAnimationFrame() {},
    console
  };
  sandbox.window = sandbox;
  sandbox.document = {
    readyState: 'complete',
    body: {
      classList: {
        add(...names) { names.forEach(name => bodyClasses.add(name)); },
        remove(...names) { names.forEach(name => bodyClasses.delete(name)); },
        contains(name) { return bodyClasses.has(name); },
        toggle(name, force) { if (force) bodyClasses.add(name); else bodyClasses.delete(name); }
      }
    },
    getElementById(id) { return els[id] || null; },
    querySelector() { return null; },
    addEventListener() {}
  };
  sandbox.getComputedStyle = function (el) {
    if (
      bodyClasses.has('fire-s-premises-render-lock') &&
      (el.id === 'homeSection' || el.id === 'mainCommandCentre')
    ) {
      return { display: 'none', visibility: 'hidden' };
    }
    return { display: el.style.display || 'block', visibility: el.style.visibility || 'visible' };
  };
  vm.runInNewContext(stagingLock, sandbox);
  return { els, sandbox };
}

const firstClick = loadLock();
workspaceIds.forEach(id => {
  firstClick.els[id].style.display = 'none';
});
firstClick.els.projectFormSection.style.display = 'block';
firstClick.els.projectFormSection.hidden = true;
assert.strictEqual(
  firstClick.sandbox.fireSRecoverHomeIfBlank(),
  false,
  'toets first + New inspection at New Site must stay on the form'
);
assert.strictEqual(firstClick.els.projectFormSection.style.display, 'block');
assert.strictEqual(firstClick.els.homeSection.style.display, 'none');

console.log('new-inspection-stay.test.js: ok');
