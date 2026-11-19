'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const app = read('staging/app.js');
const liveApp = read('app.js');
const html = read('staging/index.html');
const liveHtml = read('index.html');
const instrument = read('staging/fire-s-one-instrument.js');
const env = read('staging/fire-s-env.js');
const liveEnv = read('fire-s-env.js');

assert.ok(/1\.3\.130-toets/.test(env), 'Toets-blad version must stay on 1.3.130-toets');
assert.ok(
  /appVersion: staging \? '1\.3\.27-toets' : '1\.3\.67'/.test(liveEnv),
  'Live Fire-S must be 1.3.67'
);

assert.ok(
  /if \(localDeleted && !cloudDeleted\) \{\n      return;/.test(app) &&
    !/localDeleted && !cloudDeleted && !\(cloudTime > localTime\)/.test(app),
  'A local delete must not be replaced by the older cloud building'
);

const deleteAt = app.indexOf('async function deletePremisesFromCloud');
const deleteFn = app.slice(deleteAt, app.indexOf('async function permanentlyDeleteRecycleEntry'));
assert.ok(
  /\.delete\(\)\s*\.eq\('id', projectId\)\s*\.select\('id'\)/.test(deleteFn) &&
    !/applyInspectionDeleteFilter/.test(deleteFn),
  'Cloud delete must remove the row by id, not only a company_id match'
);
assert.ok(
  /uploadSingleInspection\(/.test(deleteFn) && /deletedAt: source\.deletedAt/.test(deleteFn),
  'If the cloud row is not removed, the delete must upload a deleted stamp'
);
assert.ok(
  /queueInspectionForUpload\(projectId\)/.test(app) &&
    /uploadPendingInspections\(\)/.test(
      app.slice(app.indexOf("appendAudit(updated, 'delete_entire_premises'"), app.indexOf('function isWithinRetention'))
    ),
  'Recycle Bin delete must upload the deleted stamp straight away'
);

function assertLiveDelete(src) {
  const deleteAt = src.indexOf('async function deletePremisesFromCloud');
  const deleteFn = src.slice(deleteAt, src.indexOf('async function permanentlyDeleteRecycleEntry'));
  assert.ok(
    /\.delete\(\)\s*\.eq\('id', projectId\)\s*\.select\('id'\)/.test(deleteFn) &&
      !/applyInspectionDeleteFilter/.test(deleteFn),
    'Live cloud delete must remove the row by id'
  );
  assert.ok(
    /uploadSingleInspection\(/.test(deleteFn),
    'Live delete must upload a deleted stamp when the row is not removed'
  );
  assert.ok(
    /uploadPendingInspections\(\)/.test(
      src.slice(src.indexOf("appendAudit(updated, 'delete_entire_premises'"), src.indexOf('function isWithinRetention'))
    ),
    'Live Recycle Bin delete must upload the deleted stamp straight away'
  );
}
assertLiveDelete(liveApp);
assert.ok(
  /app\.js\?v=1-3-67-premises-delete/.test(liveHtml) &&
    /Version 1\.3\.67/.test(liveHtml) &&
    /Report Review/.test(liveHtml),
  'Live stays on 1.3.67, loads the delete fix, and still shows Report Review'
);

assert.ok(/var CHECK_MS = 4000;/.test(instrument), 'The other instrument must be checked every 4 seconds');
assert.ok(
  /visibilitychange/.test(instrument) && /pageshow/.test(instrument),
  'Focusing the laptop must check the phone login immediately'
);
assert.ok(
  !/scope: 'others'/.test(instrument),
  'The phone login must not sign itself out'
);

assert.ok(
  !/Report Review/.test(html),
  'Additional Services must not show the Report Review card'
);

console.log('manager-delete-and-kick.test.js: ok');
