'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

function assertPersonnelCard(html, rolesJs, teamJs, boardJs, css, fitCss, manual, label) {
  const companyCard = html.match(
    /id="cmdCompanyBtn"[\s\S]*?<\/button>/
  );
  assert.ok(companyCard, label + ': Company personnel card must exist');
  assert.ok(
    /Company personnel/.test(companyCard[0]) &&
      /Add, remove or edit staff, and check inspector stats/.test(companyCard[0]),
    label + ': Home card must be titled Company personnel and mention add/remove/edit plus stats'
  );

  const inspectorsCard = html.match(/id="cmdInspectorsBtn"[^>]*>/);
  assert.ok(
    inspectorsCard && /\bhidden\b/.test(inspectorsCard[0]),
    label + ': Inspectors card must stay in the page but be hidden'
  );

  assert.ok(
    /id="companyPersonnelTabs"/.test(html) &&
      /data-personnel-tab="people"/.test(html) &&
      /data-personnel-tab="stats"/.test(html),
    label + ': Company personnel must have People and Stats tabs'
  );
  assert.ok(
    /id="companyPersonnelPeoplePanel"/.test(html) &&
      /id="companyTeamStartSeatBtn"/.test(html) &&
      /id="companyTeamList"/.test(html),
    label + ': People tab must still add and list personnel'
  );
  assert.ok(
    /id="companyPersonnelStatsPanel"[\s\S]*id="inspectorBoardSelect"[\s\S]*id="inspectorBoardBody"/.test(
      html
    ),
    label + ': Stats tab must contain the inspector stats board'
  );

  assert.ok(
    /hide\('cmdInspectorsBtn'\)/.test(rolesJs) &&
      /'Company personnel'/.test(rolesJs) &&
      /Add, remove or edit staff, and check inspector stats/.test(rolesJs) &&
      !/'People',\s*'Add Inspectors and Managers/.test(rolesJs),
    label + ': Home roles must hide Inspectors and label the remaining card Company personnel'
  );

  assert.ok(
    /function setPersonnelTab\(tab\)/.test(teamJs) &&
      /tab === 'stats'/.test(teamJs) &&
      /window\.fireSSetCompanyPersonnelTab = setPersonnelTab/.test(teamJs),
    label + ': Personnel screen must switch People / Stats tabs'
  );

  assert.ok(
    /function isStatsSurfaceOpen\(\)/.test(boardJs) &&
      /fireSOpenCompanyTeam\(\{ tab: 'stats' \}\)/.test(boardJs),
    label + ': Inspector stats must open inside Company personnel'
  );

  assert.ok(
    /#cmdInspectorsBtn[\s\S]*display: none !important/.test(css) &&
      /#cmdInspectorsBtn[\s\S]*display: none !important/.test(fitCss),
    label + ': CSS must keep the old Inspectors card hidden'
  );

  assert.ok(
    /<h3>Company personnel<\/h3>/.test(manual) &&
      /Tap <strong>Stats<\/strong>/.test(manual) &&
      !/<h3>Inspectors board<\/h3>/.test(manual),
    label + ': User manual must describe one Company personnel card with a Stats tab'
  );
}

assertPersonnelCard(
  read('index.html'),
  read('fire-s-clean-home-roles.js'),
  read('fire-s-company-team.js'),
  read('fire-s-inspector-board.js'),
  read('fire-s-inspector-board.css'),
  read('fire-s-fit-text.css'),
  read('fire-s-user-manual.js'),
  'Live'
);

assertPersonnelCard(
  read('staging/index.html'),
  read('staging/fire-s-clean-home-roles.js'),
  read('staging/fire-s-company-team.js'),
  read('staging/fire-s-inspector-board.js'),
  read('staging/fire-s-inspector-board.css'),
  read('staging/fire-s-fit-text.css'),
  read('staging/fire-s-user-manual.js'),
  'Toets'
);

const liveSubs = read('fire-s-subscriptions.js');
const stagingSubs = read('staging/fire-s-subscriptions.js');
assert.ok(
  /Open Company personnel to add people and check inspector stats/.test(liveSubs) &&
    /Open Company personnel to add people and check inspector stats/.test(stagingSubs) &&
    !/Open Inspectors board and compare/.test(liveSubs) &&
    !/Open Inspectors board and compare/.test(stagingSubs),
  'Role list must point managers to Company personnel, not a separate Inspectors board'
);

console.log('company-personnel-card.test.js ok');
