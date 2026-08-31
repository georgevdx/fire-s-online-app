'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const html = read('staging/index.html');
const team = read('staging/fire-s-company-team.js');
const subscribe = read('staging/fire-s-subscribe.js');
const phoneBack = read('staging/fire-s-phone-back.js');
const env = read('staging/fire-s-env.js');
const liveHtml = read('index.html');
const liveEnv = read('fire-s-env.js');

assert.ok(
  /id="companyTeamStartSeatBtn"/.test(html) &&
    /Add inspector \/ manager/.test(html),
  'Personnel must have one Add inspector / manager button'
);
assert.ok(
  !/id="companyTeamEmail"/.test(html) &&
    !/id="companyTeamRole"/.test(html) &&
    !/id="companyTeamAddBtn"/.test(html),
  'Personnel must not ask for email or role before the subscription page'
);
assert.ok(
  /id="fireSSubscribeSeatPanel"/.test(html) &&
    /id="fireSSeatEmail"/.test(html) &&
    /id="fireSSeatRole"/.test(html) &&
    /Subscribe this email/.test(html),
  'The subscription page must collect email and role'
);
assert.ok(
  /function openSubscribePerson\(/.test(subscribe) &&
    /window\.fireSOpenSubscribePerson = openSubscribePerson/.test(subscribe) &&
    /mode === 'seat'/.test(subscribe),
  'Add inspector / manager must open the subscription page in seat mode'
);
assert.ok(
  /window\.fireSAddPersonnelSeat = addMember/.test(team) &&
    /fireSOpenSubscribePerson/.test(team),
  'Personnel must hand the new email to the subscription page'
);
assert.ok(
  /window\.fireSSubscribeGoBack = goHome/.test(subscribe) &&
    /fireSSubscribeGoBack/.test(phoneBack),
  'Phone back from a new-person subscription must return to Personnel'
);
assert.ok(
  /1\.3\.[2-9]\d-toets/.test(env),
  'Toets-blad version must stay on 1.3.20-toets or newer'
);
assert.ok(
  /id="companyTeamStartSeatBtn"/.test(liveHtml) &&
    /id="fireSSubscribeSeatPanel"/.test(liveHtml) &&
    /appVersion: staging \? '1\.3\.27-toets' : '1\.3\.43'/.test(liveEnv),
  'Live Fire-S must add people on the subscription page after sit dit live'
);

console.log('seat-subscribe-page.test.js: ok');
