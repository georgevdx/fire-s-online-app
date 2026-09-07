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
const liveStartup = read('fire-s-startup-stability.js');
const stagingStartup = read('staging/fire-s-startup-stability.js');
const liveLock = read('fire-s-screen-lock.js');
const stagingLock = read('staging/fire-s-screen-lock.js');
const liveHtml = read('index.html');
const stagingHtml = read('staging/index.html');

function assertStayOnNewInspection(app, started, startup, lock, label) {
  assert.ok(
    /function isInspectionFormOpen\(/.test(app) &&
      /if \(isInspectionFormOpen\(\)\) return false;/.test(app),
    label + ': cloud sync must not rebuild the list while a new inspection is open'
  );
  const showForm = app.slice(
    app.indexOf('function showProjectForm()'),
    app.indexOf('function ensureNextInspectionCardId()')
  );
  assert.ok(
    /form\.hidden = false/.test(showForm) &&
      /__fireSOpeningInspection/.test(showForm) &&
      /style\.display = 'block'/.test(showForm),
    label + ': showProjectForm must mark the new inspection as on screen'
  );
  const createNew = app.slice(
    app.indexOf('function createNewProject()'),
    app.indexOf('function toggleFilterPanel()')
  );
  assert.ok(
    /__fireSOpeningInspection/.test(createNew),
    label + ': + New inspection at New Site must mark the form as opening before Home can recover'
  );

  const enterHome = started.slice(
    started.indexOf('function userLeftHome'),
    started.indexOf('async function hasPendingInviteQuiet')
  );
  assert.ok(
    /function userLeftHome\(/.test(enterHome) &&
      /if \(userLeftHome\(\)\) return;/.test(enterHome),
    label + ': the delayed Home paint after login must not run on Gateway or a new inspection'
  );

  assert.ok(
    /function inspectionWorkspaceOpen\(/.test(startup) &&
      /if \(inspectionWorkspaceOpen\(\)\) return;/.test(startup) &&
      /stayOnInspection/.test(startup),
    label + ': splash Home-only paint must not hide an open inspection'
  );

  assert.ok(
    /function inlineOpen\(el\)/.test(lock) &&
      /if \(inlineOpen\(el\)\) return true;/.test(lock) &&
      /__fireSOpeningInspection/.test(lock),
    label + ': blank-home recover must keep a new inspection on screen'
  );
}

assertStayOnNewInspection(liveApp, liveStarted, liveStartup, liveLock, 'Live');
assertStayOnNewInspection(stagingApp, stagingStarted, stagingStartup, stagingLock, 'Toets');

assert.ok(
  /app\.js\?v=1-3-55-new-insp/.test(liveHtml) &&
    /fire-s-screen-lock\.js\?v=1-7-new-insp/.test(liveHtml) &&
    /fire-s-startup-stability\.js\?v=1-9-new-insp/.test(liveHtml) &&
    /fire-s-get-started\.js\?v=2-46-new-insp/.test(liveHtml),
  'Live must cache-bust the new-inspection stay fix'
);
assert.ok(
  /app\.js\?v=1-3-61-new-insp/.test(stagingHtml) &&
    /fire-s-screen-lock\.js\?v=1-7-new-insp/.test(stagingHtml) &&
    /fire-s-startup-stability\.js\?v=1-9-new-insp/.test(stagingHtml) &&
    /fire-s-get-started\.js\?v=2-46-new-insp/.test(stagingHtml),
  'Toets-blad must cache-bust the new-inspection stay fix'
);

function makeEl(id, display) {
  const attrs = {};
  const style = {
    display: display,
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
    classList: {
      add() {},
      remove() {},
      contains() {
        return false;
      }
    },
    setAttribute(name, value) {
      attrs[name] = value;
    },
    getAttribute(name) {
      return attrs[name];
    },
    removeAttribute(name) {
      delete attrs[name];
    }
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
    MutationObserver: class {
      observe() {}
    },
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
        add(...names) {
          names.forEach(name => bodyClasses.add(name));
        },
        remove(...names) {
          names.forEach(name => bodyClasses.delete(name));
        },
        contains(name) {
          return bodyClasses.has(name);
        },
        toggle(name, force) {
          if (force) bodyClasses.add(name);
          else bodyClasses.delete(name);
        }
      }
    },
    getElementById(id) {
      return els[id] || null;
    },
    querySelector() {
      return null;
    },
    addEventListener() {}
  };
  sandbox.getComputedStyle = function getComputedStyle(el) {
    if (
      bodyClasses.has('fire-s-premises-render-lock') &&
      (el.id === 'homeSection' || el.id === 'mainCommandCentre')
    ) {
      return { display: 'none', visibility: 'hidden' };
    }
    return {
      display: el.style.display || 'block',
      visibility: el.style.visibility || 'visible'
    };
  };

  vm.runInNewContext(liveLock, sandbox);
  return { els, bodyClasses, sandbox };
}

const firstClick = loadLock();
workspaceIds.forEach(id => {
  firstClick.els[id].style.display = 'none';
});
firstClick.els.homeSection.style.display = 'none';
firstClick.els.projectListSection.style.display = 'none';
firstClick.els.projectFormSection.style.display = 'block';
firstClick.els.projectFormSection.hidden = true;
firstClick.bodyClasses.add('fire-s-premises-render-lock');
firstClick.bodyClasses.add('fire-s-filling-inspection');
assert.strictEqual(
  firstClick.sandbox.fireSIsFillingInspection(),
  true,
  'first + New inspection at New Site must count as filling an inspection'
);
assert.strictEqual(
  firstClick.sandbox.fireSRecoverHomeIfBlank(),
  false,
  'first + New inspection at New Site after login must stay on the form'
);
assert.strictEqual(firstClick.els.projectFormSection.style.display, 'block');
assert.strictEqual(firstClick.els.homeSection.style.display, 'none');

console.log('new-inspection-stay.test.js: ok');
