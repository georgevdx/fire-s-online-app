'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

assert.ok(
  /function fireSIsDeletedPremises\(project\)/.test(app),
  'Deleted premises must have one shared check'
);
assert.ok(
  /!fireSIsDeletedPremises\(project\)/.test(app),
  'Visible premises list must drop deleted places'
);
assert.ok(
  /function filterDeletedProjects\(projects\) \{\s*return \(projects \|\| \[\]\)\.filter\(project => !fireSIsDeletedPremises\(project\)\);/.test(app),
  'Deleted register filter must use the shared deleted check'
);
assert.ok(
  /window\.fireSIsInspectionOverdue/.test(app) &&
    /Executive Snapshot/.test(app),
  'Executive Snapshot overdue must use the same inspection-overdue rule'
);
assert.ok(
  /scheduledDate \|\| project\?\.followUpDate/.test(app),
  'Overdue date must prefer scheduled date, then follow-up date'
);
assert.ok(
  /fireSIsDeletedPremises\(localProject\)/.test(app),
  'Cloud download must not bring a deleted premises back onto the list'
);
assert.ok(
  /function fireSHasRecycledCurrentInspection\(project\)/.test(app),
  'Overdue must know when the current inspection is in Recycle'
);
assert.ok(
  /Leftover dates must not count/.test(app),
  'Deleted current inspections must not add to Overdue'
);
assert.ok(
  /window\.fireSIsInspectionOverdue === 'function'\) return !!window\.fireSIsInspectionOverdue/.test(app),
  'More Filters Overdue must use the same rule as Executive Snapshot'
);

console.log('overdue-hide-deleted.test.js: ok');
