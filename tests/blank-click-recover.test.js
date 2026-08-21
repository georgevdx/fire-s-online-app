'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

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
  const listeners = {};

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
    addEventListener(type, fn) {
      listeners[type] = fn;
    }
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

  const code = fs.readFileSync(
    path.join(__dirname, '..', 'fire-s-screen-lock.js'),
    'utf8'
  );
  vm.runInNewContext(code, sandbox);
  return { els, bodyClasses, sandbox, listeners };
}

function hideAll(els) {
  workspaceIds.forEach(id => {
    els[id].style.display = 'none';
    els[id].hidden = false;
  });
}

const blank = loadLock();
hideAll(blank.els);
blank.bodyClasses.add('fire-s-premises-render-lock');
blank.bodyClasses.add('fire-s-away-from-home');
assert.strictEqual(
  blank.sandbox.fireSRecoverHomeIfBlank(),
  true,
  'blank screen must recover Home'
);
assert.strictEqual(blank.els.homeSection.style.display, 'block');
assert.strictEqual(blank.els.homeSection.hidden, false);
assert.ok(!blank.bodyClasses.has('fire-s-premises-render-lock'));
assert.ok(!blank.bodyClasses.has('fire-s-away-from-home'));

const lockedHome = loadLock();
hideAll(lockedHome.els);
lockedHome.els.homeSection.style.display = 'block';
lockedHome.bodyClasses.add('fire-s-premises-render-lock');
lockedHome.sandbox.fireSApplyScreenLock();
assert.strictEqual(
  lockedHome.els.homeSection.style.display,
  'block',
  'Home must stay visible after lock is wrongly left on with no Gateway'
);
assert.ok(
  !lockedHome.bodyClasses.has('fire-s-premises-render-lock'),
  'lock class must clear when Gateway is not on screen'
);

const gateway = loadLock();
hideAll(gateway.els);
gateway.els.projectListSection.style.display = 'block';
gateway.bodyClasses.add('fire-s-premises-render-lock');
assert.strictEqual(
  gateway.sandbox.fireSRecoverHomeIfBlank(),
  false,
  'Gateway must not be replaced with Home'
);
assert.strictEqual(gateway.els.projectListSection.style.display, 'block');
assert.strictEqual(gateway.els.homeSection.style.display, 'none');

const staleSync = loadLock();
hideAll(staleSync.els);
staleSync.bodyClasses.add('fire-s-premises-render-lock');
staleSync.sandbox.fireSApplyScreenLock();
assert.strictEqual(staleSync.els.homeSection.style.display, 'block');
assert.ok(!staleSync.bodyClasses.has('fire-s-premises-render-lock'));

assert.ok(typeof blank.listeners.visibilitychange === 'function');

console.log('blank-click-recover.test.js ok');
