'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const liveHtml = read('index.html');
const liveCss = read('fire-s-owner-lists.css');
const liveLists = read('fire-s-owner-lists.js');
const liveEnv = read('fire-s-env.js');
const stagingHtml = read('staging/index.html');
const stagingCss = read('staging/fire-s-owner-lists.css');
const stagingLists = read('staging/fire-s-owner-lists.js');

function assertLookupMarkup(label, html, css, lists, jsTag) {
  assert.ok(
    /id="fireSOwnerListsLookup"/.test(html) &&
      /id="fireSOwnerListsLookupMatches"/.test(html) &&
      /placeholder="Type a premises name"/.test(html) &&
      !/fireSOwnerListsLookupOptions/.test(html),
    label + ': Home All buildings must have a premises lookup text field'
  );
  assert.ok(
    /Lookup premises/.test(html) &&
      /Type a premises\. All buildings jumps to that site/.test(html),
    label + ': Lookup must sit on All buildings and say it jumps to the typed premises'
  );
  assert.ok(
    new RegExp('fire-s-owner-lists\\.js\\?v=' + jsTag).test(html) &&
      /fire-s-owner-lists\.css\?v=1-3-home-lookup/.test(html),
    label + ': Phone must cache-bust the Home premises lookup'
  );
  assert.ok(
    /\.fire-s-owner-lists-lookup input/.test(css) &&
      /\.fire-s-owner-lists-lookup-hit/.test(css) &&
      /tr\.fire-s-owner-lists-row\.is-lookup-hit td/.test(css) &&
      /\.fire-s-owner-lists-lookup-matches\[hidden\]/.test(css),
    label + ': Lookup field, matches and the jumped-to row must be styled'
  );
  assert.ok(
    /function pickLookupTarget\(rows, needle, requireExact\)/.test(lists) &&
      /root\.fireSNavigateOwnerListLookup = navigateLookup/.test(lists) &&
      /openBuilding\(target\.id\)/.test(lists),
    label + ': Typed lookup must navigate All buildings to the matching premises'
  );
}

assertLookupMarkup('Live', liveHtml, liveCss, liveLists, '1-3-home-lookup');
assertLookupMarkup('Toets', stagingHtml, stagingCss, stagingLists, '1-9-overdue');
assert.ok(
  /Version 1\.3\.66/.test(liveHtml) &&
    /appVersion: staging \? '1\.3\.27-toets' : '1\.3\.66'/.test(liveEnv),
  'Live must keep displayed version 1.3.66 after sitting PayFast live'
);

function el(store, id) {
  if (!store[id]) {
    store[id] = {
      id: id,
      hidden: id !== 'fireSOwnerListsLookup',
      value: '',
      style: {
        setProperty(name, value) {
          this[name] = value;
        }
      },
      innerHTML: '',
      textContent: '',
      setAttribute() {},
      removeAttribute() {},
      addEventListener() {},
      classList: {
        contains() { return false; },
        add() {},
        remove() {}
      },
      querySelector(sel) {
        const html = String(this.innerHTML || '');
        const match = html.match(/data-project-id="([^"]+)"/);
        if (!sel || !match) return null;
        return {
          getAttribute() { return match[1]; },
          scrollIntoView() {},
          classList: { add() {}, remove() {}, contains() { return false; } }
        };
      }
    };
  }
  return store[id];
}

function runLookup(label, listsSrc) {
  const elements = {};
  const opened = [];
  const stored = [
    { id: 'mall', organisationName: 'West End Mall', siteName: 'Shop 12', completedAt: '2026-06-01' },
    { id: 'school', organisationName: 'Greenfield School', completedAt: '2026-08-01' },
    { id: 'clinic', organisationName: 'River Clinic', completedAt: '2026-04-01' },
    { id: 'westgate', organisationName: 'Westgate Plaza', completedAt: '2026-05-01' }
  ];

  const sandbox = {
    document: {
      readyState: 'complete',
      getElementById(id) {
        return el(elements, id);
      },
      addEventListener() {},
      body: {
        classList: {
          contains(name) {
            return name === 'fire-s-role-owner';
          }
        }
      }
    },
    setTimeout() {},
    __fireSCloudPullSettled: true,
    getProjects() {
      return stored.slice();
    },
    openProject(id) {
      opened.push(String(id));
    }
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  vm.runInNewContext(listsSrc, sandbox);

  assert.equal(
    sandbox.fireSPickOwnerListLookupTarget(sandbox.fireSBuildOwnerListModel(stored).all, 'west end mall – shop 12', true).id,
    'mall',
    label + ': Exact lookup text must pick that All buildings premises'
  );
  assert.equal(
    sandbox.fireSPickOwnerListLookupTarget(sandbox.fireSBuildOwnerListModel(stored).all, 'Greenfield', true),
    null,
    label + ': A partial name must not auto-open until Enter'
  );
  assert.equal(
    sandbox.fireSPickOwnerListLookupTarget(sandbox.fireSBuildOwnerListModel(stored).all, 'Greenfield', false).id,
    'school',
    label + ': Enter on a unique prefix must navigate to that premises'
  );
  assert.equal(
    sandbox.fireSPickOwnerListLookupTarget(sandbox.fireSBuildOwnerListModel(stored).all, 'West', false),
    null,
    label + ': Ambiguous lookup text must stay on All buildings, not guess a premises'
  );

  sandbox.fireSRefreshOwnerLists();
  assert.ok(
    /West End Mall/.test(el(elements, 'fireSOwnerListsAllBody').innerHTML) &&
      /Greenfield School/.test(el(elements, 'fireSOwnerListsAllBody').innerHTML),
    label + ': Empty lookup must keep the full All buildings list'
  );

  el(elements, 'fireSOwnerListsLookup').value = 'mall';
  sandbox.fireSApplyOwnerListLookup();
  assert.ok(
    /West End Mall/.test(el(elements, 'fireSOwnerListsAllBody').innerHTML),
    label + ': Lookup text must jump All buildings to the typed premises'
  );
  assert.ok(
    !/Greenfield School/.test(el(elements, 'fireSOwnerListsAllBody').innerHTML) &&
      !/River Clinic/.test(el(elements, 'fireSOwnerListsAllBody').innerHTML),
    label + ': Lookup must hide buildings that do not match the typed premises'
  );
  assert.ok(
    /is-lookup-hit/.test(el(elements, 'fireSOwnerListsAllBody').innerHTML),
    label + ': The matched All buildings row must be marked as the lookup hit'
  );
  assert.ok(
    /data-project-id="mall"/.test(el(elements, 'fireSOwnerListsLookupMatches').innerHTML),
    label + ': Lookup matches must offer the typed premises to tap'
  );

  el(elements, 'fireSOwnerListsLookup').value = 'Greenfield School';
  const openedExact = sandbox.fireSNavigateOwnerListLookup(false);
  assert.equal(openedExact && openedExact.id, 'school');
  assert.deepStrictEqual(opened, ['school'], label + ': Picking the typed premises name must open that building');

  opened.splice(0, opened.length);
  el(elements, 'fireSOwnerListsLookup').value = 'River';
  const openedEnter = sandbox.fireSNavigateOwnerListLookup(true);
  assert.equal(openedEnter && openedEnter.id, 'clinic');
  assert.deepStrictEqual(opened, ['clinic'], label + ': Enter on unique lookup text must navigate to that premises');
}

runLookup('Live', liveLists);
runLookup('Toets', stagingLists);

console.log('home-buildings-lookup.test.js: ok');
