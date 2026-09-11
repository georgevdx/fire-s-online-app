'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

function assertLightSurfaceFonts(label, css, fitCss, app) {
  assert.ok(
    /html\[data-fire-s-theme="dark"\] #mainCommandCentre \.main-command-card:not\(\.primary\):not\(#cmdInspectionsBtn\) \.command-title/.test(css) &&
      /html\[data-fire-s-theme="dark"\] #mainCommandCentre \.main-command-card:not\(\.primary\):not\(#cmdInspectionsBtn\) \.command-copy/.test(css) &&
      /color: #0f172a !important/.test(css) &&
      /color: #334155 !important/.test(css),
    label + ': Dark Mode must keep dark titles on white Home command tiles'
  );
  assert.ok(
    /html\[data-fire-s-theme="dark"\] #mainCommandCentre #cmdInspectionsBtn \.command-title/.test(css) &&
      /html\[data-fire-s-theme="dark"\] #mainCommandCentre \.main-command-card\.primary \.command-copy/.test(css),
    label + ': Inspection Gateway primary tile must keep white text'
  );
  assert.ok(
    /html\[data-fire-s-theme="dark"\] \.startup-route-card/.test(css) &&
      /html\[data-fire-s-theme="dark"\] \.startup-route-card \.route-title/.test(css) &&
      /html\[data-fire-s-theme="dark"\] \.startup-route-card \.route-copy/.test(css) &&
      /html\[data-fire-s-theme="dark"\] #homeLogoutBtn\.startup-route-card/.test(css),
    label + ': Access / Logout under Services/Support must keep readable type on the white card'
  );
  assert.ok(
    /html\[data-fire-s-theme="dark"\] \.fire-s-cc-eyebrow/.test(css) &&
      /html\[data-fire-s-theme="dark"\] \.fire-s-cc-quick button/.test(css) &&
      /html\[data-fire-s-theme="dark"\] \.fire-s-cc-quick button:disabled/.test(css) &&
      /html\[data-fire-s-theme="dark"\] \.fire-s-cc-quick button\.fire-s-cc-quick-primary/.test(css) &&
      /html\[data-fire-s-theme="dark"\] \.fire-s-cc-quick button\.fire-s-cc-data-v12/.test(css),
    label + ': Command Centre Quick Actions must stay dark on the white overlay'
  );
  assert.ok(
    /html\[data-fire-s-theme="dark"\] \.fire-s-continue-confirm-v11 h3/.test(css) &&
      /html\[data-fire-s-theme="dark"\] \.fire-s-continue-confirm-v11 p/.test(css) &&
      /html\[data-fire-s-theme="dark"\] \.fire-s-continue-confirm-v11__eyebrow/.test(css) &&
      /html\[data-fire-s-theme="dark"\] \.fire-s-continue-confirm-v11__premises strong/.test(css),
    label + ': Continue-inspection dialog must keep dark text on the white card'
  );
  assert.ok(
    /Dark Mode: dark type on white Home tiles/.test(fitCss),
    label + ': fit-text stylesheet must keep the white-surface contrast after styles.css'
  );
  assert.ok(
    /html\[data-fire-s-theme="dark"\] \.fire-s-continue-confirm-v11 h3/.test(app) &&
      /html\[data-fire-s-theme="dark"\] \.fire-s-cc-quick button/.test(app) &&
      /\.fire-s-cc-quick button:disabled \{ opacity:1/.test(app) &&
      /\.fire-s-cc-eyebrow \{ color:#334155 !important/.test(app),
    label + ': injected overlay styles must beat the global Dark Mode span/p/h3 colours'
  );
}

assertLightSurfaceFonts('Live', read('styles.css'), read('fire-s-fit-text.css'), read('app.js'));
assertLightSurfaceFonts('Toets', read('staging/styles.css'), read('staging/fire-s-fit-text.css'), read('staging/app.js'));

console.log('light-surface-fonts.test.js: ok');
