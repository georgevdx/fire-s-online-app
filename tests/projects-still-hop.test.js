'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const liveApp = read('app.js');
const stagingApp = read('staging/app.js');
const liveHtml = read('index.html');
const stagingHtml = read('staging/index.html');
const liveEnv = read('fire-s-env.js');
const stagingEnv = read('staging/fire-s-env.js');
const liveStill = read('fire-s-gateway-still.js');
const stagingStill = read('staging/fire-s-gateway-still.js');

function assertStillScript(src, label) {
  assert.ok(
    /function fireSGatewayStillRender/.test(src) &&
      /gatewayOpen\(\)/.test(src) &&
      /listAlreadyPainted\(\)/.test(src),
    label + ': must skip background list rebuilds while the gateway is open'
  );
  assert.ok(
    /options\.force === true \|\| options\.forcePaint === true/.test(src),
    label + ': Sync Now / force paint must still rebuild the list'
  );
  assert.ok(
    /projectSearch/.test(src) && /premisesQuickSelect/.test(src),
    label + ': typing in search or premises must still rebuild the list'
  );
  assert.ok(
    /function fireSGatewayStillKpiRefresh/.test(src),
    label + ': KPI refresh must not wipe the open gateway'
  );
  assert.ok(
    /setInterval\(install, 2500\)/.test(src) &&
      /3200/.test(src) &&
      /5000/.test(src),
    label + ': later layers must not steal the still wrapper'
  );
}

function assertAppStaysStill(src, label) {
  const stabilizer = src.slice(
    src.indexOf('function stableRenderProjectsList'),
    src.indexOf('stableRenderProjectsList.__fireSInitialStabiliser119')
  );
  assert.ok(
    /if \(sameSignature\) \{\s*return;/.test(stabilizer),
    label + ': same list signature must not queue another forced paint'
  );
  assert.ok(
    !/setTimeout\(\(\) => \{\s*if \(typeof renderProjectsList === 'function'\) renderProjectsList\(\{ force: true \}\);\s*\}, 0\)/.test(src),
    label + ': opening the gateway must not force a second paint'
  );
  assert.ok(
    /dataset\.fireSGatewayPaint === paintKey/.test(src),
    label + ': the final list painter must skip when the cards did not change'
  );
  const filterApply = src.slice(
    src.indexOf('window.fireSApplyMissionFilter136A11 = function'),
    src.indexOf('window.fireSApplyMissionFilter136A8 = window.fireSApplyMissionFilter136A11')
  );
  assert.ok(
    /setActiveFilter\(key\);\s*renderProjects\(\);/.test(filterApply) &&
      !/\[0, 60, 180, 420\]/.test(filterApply),
    label + ': a filter tap must paint the list once'
  );
  assert.ok(
    /data-fire-s-exec-html/.test(src),
    label + ': Executive Snapshot must not rebuild when the numbers are the same'
  );
  const restore = src.slice(
    src.indexOf('async function restoreCloudSession'),
    src.indexOf('async function restoreCloudSession') + 4000
  );
  assert.ok(
    /shouldPaintProjectsAfterSync\(false\)/.test(restore),
    label + ': restoring a saved login must not hop the open gateway'
  );
}

assertStillScript(liveStill, 'Live still');
assertStillScript(stagingStill, 'Toets still');
assert.strictEqual(liveStill, stagingStill, 'Live and toets still scripts must match');

assertAppStaysStill(liveApp, 'Live');
assertAppStaysStill(stagingApp, 'Toets');

assert.ok(
  /appVersion: staging \? '1\.3\.27-toets' : '1\.3\.55'/.test(liveEnv),
  'Live Fire-S must be 1.3.55'
);
assert.ok(/1\.3\.61-toets/.test(stagingEnv), 'Toets-blad version must be 1.3.61-toets');
assert.ok(
  /fire-s-gateway-still\.js\?v=1-0-still/.test(liveHtml) &&
    /app\.js\?v=1-3-55-gateway/.test(liveHtml) &&
    /fire-s-env\.js\?v=1-3-55-live/.test(liveHtml),
  'Live must load the still script and cache-bust the hop fix'
);
assert.ok(
  /fire-s-gateway-still\.js\?v=1-0-still/.test(stagingHtml) &&
    /app\.js\?v=1-3-61-gateway/.test(stagingHtml) &&
    /fire-s-env\.js\?v=1-3-61-toets/.test(stagingHtml),
  'Toets-blad must load the still script and cache-bust the hop fix'
);

const vm = require('vm');

function makeEl(id, opts) {
  return {
    id,
    hidden: false,
    style: { display: (opts && opts.display) || '' },
    dataset: Object.assign({}, (opts && opts.dataset) || {}),
    value: (opts && opts.value) || '',
    querySelector() {
      return opts && opts.hasCards ? { className: 'fire-s-136a8-card' } : null;
    }
  };
}

function runStillCase(label, setup, call, expectCalls) {
  const els = {
    projectListSection: makeEl('projectListSection', { display: 'block' }),
    projectFormSection: makeEl('projectFormSection', { display: 'none' }),
    projectsList: makeEl('projectsList', {
      hasCards: true,
      dataset: { fireSGatewayPaint: 'all::1::2::a|b' }
    }),
    projectSearch: makeEl('projectSearch'),
    premisesQuickSelect: makeEl('premisesQuickSelect')
  };
  let paints = 0;
  const context = {
    window: {},
    document: {
      getElementById(id) {
        return els[id] || null;
      },
      activeElement: null
    },
    Date,
    setTimeout() {
      return 1;
    },
    setInterval() {
      return 1;
    }
  };
  context.window = context;
  context.getComputedStyle = function (el) {
    return { display: el.style.display || 'block', visibility: 'visible' };
  };
  context.window.renderProjectsList = function () {
    paints += 1;
  };
  vm.createContext(context);
  vm.runInContext(liveStill, context);
  setup(context, els);
  call(context);
  assert.strictEqual(paints, expectCalls, label);
}

runStillCase(
  'open gateway must ignore leftover background paints',
  function () {},
  function (ctx) {
    ctx.window.renderProjectsList();
    ctx.window.renderProjectsList();
    ctx.window.renderProjectsList();
  },
  0
);
runStillCase(
  'Sync Now must still paint',
  function () {},
  function (ctx) {
    ctx.window.renderProjectsList({ forcePaint: true });
  },
  1
);
runStillCase(
  'search typing must still paint',
  function (ctx, els) {
    ctx.document.activeElement = els.projectSearch;
  },
  function (ctx) {
    ctx.window.renderProjectsList();
  },
  1
);

console.log('projects-still-hop.test.js: ok');
