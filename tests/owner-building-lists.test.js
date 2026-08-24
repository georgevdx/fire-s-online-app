'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const html = read('index.html');
const js = read('fire-s-owner-lists.js');
const css = read('fire-s-owner-lists.css');
const rolesJs = read('fire-s-clean-home-roles.js');
const rolesCss = read('fire-s-clean-home-roles.css');
const env = read('fire-s-env.js');

assert.ok(
  /id="fireSOwnerLists"/.test(html) &&
    /id="fireSOwnerListsAllBody"/.test(html) &&
    /id="fireSOwnerListsUpcomingBody"/.test(html) &&
    /id="fireSOwnerListsDeficiencyBody"/.test(html),
  'Home must include owner building list tables'
);
assert.ok(
  /<table class="fire-s-owner-lists-table"/.test(html),
  'Owner lists must be HTML tables, not premises cards'
);
assert.ok(
  !/#fireSOwnerLists[\s\S]{0,200}ultra-premises-card/.test(html),
  'Owner list markup must not use premises cards'
);
assert.ok(
  /Last inspected/.test(html) &&
    /Upcoming inspections \(next 30 days\)/.test(html) &&
    /Buildings with deficiencies/.test(html),
  'Owner lists must cover last inspected, upcoming 30 days, and deficiencies'
);
assert.ok(
  /fire-s-owner-lists\.js/.test(html) && /fire-s-owner-lists\.css/.test(html),
  'Owner lists script and CSS must load on Home'
);
assert.ok(
  /function buildModel\(projects, today\)/.test(js) &&
    /window\.fireSBuildOwnerListModel = buildModel/.test(js) ||
    /root\.fireSBuildOwnerListModel = buildModel/.test(js),
  'Owner lists must expose a model builder'
);
assert.ok(
  /lastSaved/.test(js) === false || /Do not use lastSaved/.test(js),
  'Last inspected must not treat a draft save as an inspection'
);
assert.ok(
  !js.includes('lastSaved'),
  'Last inspected must ignore lastSaved draft timestamps'
);
assert.ok(
  /addDays\(todayIso, 30\)/.test(js),
  'Upcoming list must use a 30-day window'
);
assert.ok(
  /text\(answer && answer\.answer\)\.toLowerCase\(\) === 'no'/.test(js),
  'Deficiency list must count No answers'
);
assert.ok(
  /hideManagementOverlays/.test(rolesJs) &&
    /'fireSOwnerLists'/.test(rolesJs),
  'Inspector / guest Home must hide the owner lists'
);
assert.ok(
  /fireSRefreshOwnerLists/.test(rolesJs),
  'Owner and Manager Home must refresh the building lists'
);
assert.ok(
  /fire-s-role-inspector #fireSOwnerLists/.test(rolesCss) &&
    /fire-s-role-owner #fireSOwnerLists/.test(rolesCss),
  'CSS must show lists for Owner and hide them for Inspector'
);
assert.ok(
  /fire-s-owner-lists-table/.test(css) &&
    !/ultra-premises-card/.test(css),
  'Owner list CSS must style tables, not cards'
);
assert.ok(
  /1\.3\.11/.test(env),
  'App version must move to 1.3.11 for the owner lists build'
);

const elements = {};
function el(id) {
  if (!elements[id]) {
    elements[id] = {
      id,
      hidden: true,
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
      classList: { contains() { return false; } }
    };
  }
  return elements[id];
}

const sandbox = {
  window: {},
  document: {
    readyState: 'complete',
    getElementById(id) {
      return el(id);
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
  setTimeout() {}
};
sandbox.window = sandbox;
sandbox.global = sandbox;
vm.createContext(sandbox);
vm.runInContext(js, sandbox);

const build = sandbox.fireSBuildOwnerListModel;
assert.equal(typeof build, 'function', 'fireSBuildOwnerListModel must be a function');

const today = '2026-08-24';
const model = build([
  {
    id: 'mall',
    organisationName: 'West End Mall',
    siteName: 'Shop 12',
    completedAt: '2026-06-01',
    scheduledDate: '2026-09-10',
    answers: [{ answer: 'Yes' }]
  },
  {
    id: 'school',
    organisationName: 'Greenfield School',
    siteName: '',
    inspectionDate: '2026-08-01',
    lastSaved: '2026-08-24T10:00:00',
    followUpDate: '2026-09-05',
    answers: [{ answer: 'No' }, { answer: 'No' }, { answer: 'Yes' }]
  },
  {
    id: 'clinic',
    organisationName: 'River Clinic',
    scheduledDate: '2026-08-30',
    answers: []
  },
  {
    id: 'deleted',
    organisationName: 'Gone Building',
    deletedAt: '2026-08-01',
    scheduledDate: '2026-09-01',
    answers: [{ answer: 'No' }]
  },
  {
    id: 'far',
    organisationName: 'Far Site',
    scheduledDate: '2026-12-01',
    completedAt: '2026-01-01'
  },
  {
    id: 'overdue',
    organisationName: 'Late Hall',
    scheduledDate: '2026-08-01'
  },
  {
    id: 'recycle',
    organisationName: 'Recycle Leftover',
    scheduledDate: '2026-09-01',
    recycleBin: { currentInspections: [{ id: 'old' }] }
  }
], today);

assert.equal(model.count, 6, 'Deleted buildings must not count on the inspection list');
assert.deepStrictEqual(
  model.all.map(row => row.name),
  [
    'Far Site',
    'Greenfield School',
    'Late Hall',
    'Recycle Leftover',
    'River Clinic',
    'West End Mall – Shop 12'
  ]
);
assert.equal(
  model.all.find(row => row.id === 'school').lastInspected,
  '2026-08-01',
  'Last inspected must use the inspection date, not lastSaved'
);
assert.equal(
  model.all.find(row => row.id === 'clinic').lastInspected,
  '',
  'A building that was never inspected must have an empty last-inspected date'
);
assert.deepStrictEqual(
  model.upcoming.map(row => row.id),
  ['clinic', 'school', 'mall'],
  'Upcoming must be due in the next 30 days, not overdue, far, deleted, or recycle leftovers'
);
assert.equal(model.upcoming[0].days, 6);
assert.equal(model.upcoming[1].days, 12);
assert.equal(model.upcoming[2].days, 17);
assert.deepStrictEqual(
  model.deficiencies.map(row => ({ id: row.id, count: row.count })),
  [{ id: 'school', count: 2 }],
  'Only buildings with No answers belong on the deficiency list'
);
assert.ok(
  !model.all.some(row => row.id === 'deleted'),
  'Deleted buildings must not appear on the name list'
);

console.log('owner-building-lists.test.js: ok');
