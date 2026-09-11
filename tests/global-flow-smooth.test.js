'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const env = read('staging/fire-s-env.js');
const html = read('staging/index.html');
const app = read('staging/app.js');
const startup = read('staging/fire-s-startup-stability.js');
const getStarted = read('staging/fire-s-get-started.js');
const flow = read('staging/fire-s-global-flow.js');
const liveEnv = read('fire-s-env.js');
const liveHtml = read('index.html');
const liveApp = read('app.js');
const liveStartup = read('fire-s-startup-stability.js');
const liveGetStarted = read('fire-s-get-started.js');
const liveFlow = read('fire-s-global-flow.js');

assert.ok(/1\.3\.72-toets/.test(env), 'Toets-blad version must be 1.3.72-toets');
assert.ok(
  /appVersion: staging \? '1\.3\.27-toets' : '1\.3\.64'/.test(liveEnv),
  'Live Fire-S must be 1.3.64 after sit dit live'
);
assert.ok(
  /fire-s-global-flow\.js\?v=1-1-copy/.test(liveHtml) &&
    /app\.js\?v=1-3-64-route/.test(liveHtml),
  'Live must load the global-flow script'
);
assert.ok(
  /fire-s-global-flow\.js\?v=1-1-copy/.test(html) &&
    /app\.js\?v=1-3-72-toets-route/.test(html) &&
    /fire-s-env\.js\?v=1-3-72-ver/.test(html),
  'Toets-blad must load the global-flow script with a fresh cache tag'
);

assert.ok(
  /window\.fireSShouldShowAccess = shouldShowAccess/.test(getStarted),
  'Access must tell splash whether Login should stay on screen'
);
assert.ok(
  /fireSShouldShowAccess\(\) &&/.test(startup) && /fireSOpenAccess\('login'\)/.test(startup),
  'After splash, signed-out users must land on Access, not empty Home tiles'
);

assert.ok(
  /isLocalFallback/.test(app) && /fireSOpenAccess\('login'\)/.test(app),
  'Inspection Gateway must ask for Login instead of inventing a local-user'
);
assert.ok(
  !/currentUserProfile = \{\s*id: 'local-user'/.test(
    app.slice(app.indexOf('function showProjectList()'), app.indexOf('function showProjectList()') + 900)
  ),
  'Opening Gateway must not inject local-user'
);

assert.ok(
  /Capture click fallback: KPI month card only/.test(app) &&
    /#cmdComplianceInspectionsBtn/.test(app) &&
    /bindHard\('cmdInspectionsBtn', 'all'/.test(app) &&
    /fsDashboardOpenGateway\(\s*'all'/.test(app),
  'Inspection Gateway must open all premises, not This Month'
);
assert.ok(
  /cmdInspectionsBtn: \[FILTERS\.gateway, 'Inspection Gateway opened\.'\]/.test(app),
  'RC 1.3.5 must keep Inspection Gateway as the all-premises door'
);

assert.ok(
  /function isLocalFallback/.test(flow) &&
    /assertGatewayLabel/.test(flow) &&
    /wrapShowProjectList/.test(flow),
  'Global flow must keep Login-first and Gateway-all after later KPI modules run'
);

assert.ok(
  /isLocalFallback/.test(liveApp) &&
    /Capture click fallback: KPI month card only/.test(liveApp) &&
    /window\.fireSShouldShowAccess = shouldShowAccess/.test(liveGetStarted) &&
    /fireSOpenAccess\('login'\)/.test(liveStartup) &&
    /wrapShowProjectList/.test(liveFlow),
  'Live must ship the same Access-to-Gateway process as the toets-blad'
);

const GATEWAY_COPY = 'Open, continue, search and manage inspections.';
function assertStableGatewayCopy(src, flowSrc, htmlSrc, label) {
  assert.ok(
    htmlSrc.includes('command-copy">' + GATEWAY_COPY),
    label + ': HTML Inspection Gateway copy must stay Open, continue…'
  );
  assert.ok(
    /setLabel\(gatewayBtn, 'Inspection Gateway', 'Open, continue, search and manage inspections\.'\)/.test(src),
    label + ': KPI refresh must not swap Gateway copy to Search, open…'
  );
  assert.ok(
    /label\('cmdInspectionsBtn', 'Inspection Gateway', 'Open, continue, search and manage inspections\.'\)/.test(src),
    label + ': Executive labels must keep the same Gateway sentence'
  );
  assert.ok(
    !/Inspection Gateway', 'Search, open/.test(src) &&
      !/Inspection Gateway','Search, open/.test(src),
    label + ': no Home layer may rewrite Inspection Gateway to Search, open…'
  );
  assert.ok(
    /const GATEWAY_COPY = 'Open, continue, search and manage inspections\.'/.test(flowSrc) &&
      /\^Search, open/.test(flowSrc),
    label + ': global flow must pin Search, open… back to Open, continue…'
  );
}
assertStableGatewayCopy(liveApp, liveFlow, liveHtml, 'Live');
assertStableGatewayCopy(app, flow, html, 'Toets');

function assertGatewayCopyPin(flowSrc, label) {
  const start = flowSrc.indexOf('function assertGatewayLabel()');
  const end = flowSrc.indexOf('function wrapShowProjectList()', start);
  assert.ok(start > 0 && end > start, label + ': assertGatewayLabel must exist');
  const copy = { textContent: 'Search, open and manage inspections.' };
  const btn = {
    querySelector(sel) {
      if (String(sel).includes('command-copy')) return copy;
      return { textContent: 'Inspection Gateway' };
    },
    setAttribute() {},
    title: ''
  };
  const pin = new Function(
    'document',
    flowSrc.slice(flowSrc.indexOf('const GATEWAY_COPY'), end) + '\nreturn assertGatewayLabel;'
  )({
    getElementById(id) {
      return id === 'cmdInspectionsBtn' ? btn : null;
    }
  });
  pin();
  assert.strictEqual(
    copy.textContent,
    GATEWAY_COPY,
    label + ': Search, open… must settle on Open, continue, search and manage inspections.'
  );
}
assertGatewayCopyPin(liveFlow, 'Live pin');
assertGatewayCopyPin(flow, 'Toets pin');

console.log('global-flow-smooth.test.js: ok');
