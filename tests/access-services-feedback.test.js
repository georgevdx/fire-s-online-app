'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const html = read('staging/index.html');
const env = read('staging/fire-s-env.js');
const sw = read('staging/service-worker.js');
const started = read('staging/fire-s-get-started.js');
const startedCss = read('staging/fire-s-get-started.css');
const styles = read('staging/styles.css');
const app = read('staging/app.js');
const homeRoles = read('staging/fire-s-clean-home-roles.js');

assert.ok(
  /Version 1\.3\.112-toets/.test(html) &&
    /appVersion: staging \? '1\.3\.112-toets'/.test(env) &&
    /TOETS-BLAD 1\.3\.112-toets/.test(env) &&
    /fireS\.toetsCacheDrop\.1-3-113/.test(html) &&
    /service-worker\.js\?v=108-75-toets-113/.test(html) &&
    /fire-s-108-75-toets-113/.test(sw),
  'Toets must leave 1.3.110 so a phone can tell it has this Access/services build'
);

const login = html.match(
  /id="fireSGetStartedLoginFields"[\s\S]*?id="fireSGetStartedResetFields"/
);
assert.ok(login, 'Access login fields must exist');
assert.ok(
  login[0].indexOf('First time? Create password') === -1 &&
    login[0].indexOf('id="fireSSwitchToCreateBtn"') === -1 &&
    /setCreatePasswordVisible\(false\)/.test(started) &&
    !/setCreatePasswordVisible\(true\)/.test(started),
  'Access must not show First time? Create password'
);

const guest = html.match(
  /id="fireSGetStartedGuestFields"[\s\S]*?id="fireSGetStartedCompanyOnly"/
);
assert.ok(guest, 'Subscribe New Company fields must exist');
assert.ok(
  /id="fireSGetStartedPassword"/.test(guest[0]) &&
    /id="fireSGetStartedPassword2"/.test(guest[0]) &&
    /Confirm password/.test(guest[0]),
  'Subscribe New Company must ask the owner to confirm the password'
);
const register = started.match(
  /async function doRegisterCompany\(\) \{[\s\S]*?async function doFinishCompanyOnly/
);
assert.ok(register, 'doRegisterCompany must exist');
assert.ok(
  /fireSGetStartedPassword2/.test(register[0]) &&
    /The two passwords do not match/.test(register[0]) &&
    /Confirm the password/.test(register[0]),
  'Subscribe New Company must reject a password that is not confirmed'
);

assert.ok(
  /id="cmdServicesBtn"/.test(html) &&
    /Request Fire Consultant Services/.test(html) &&
    /Request Fire Consultant Services/.test(homeRoles) &&
    /#mainCommandCentre #cmdServicesBtn/.test(styles) &&
    /linear-gradient\(135deg, #fde68a/.test(styles) &&
    /Request Fire Consultant Services/.test(login[0]) &&
    /linear-gradient\(180deg, #fbbf24/.test(startedCss),
  'Home and Access must show catchy Request Fire Consultant Services'
);

const services = html.match(
  /id="servicesSection"[\s\S]*?id="projectListSection"/
);
assert.ok(services, 'Additional Services section must exist');
assert.ok(
  /class="service-requests-admin" hidden/.test(services[0]) &&
    /id="viewServiceRequestsBtn"/.test(services[0]) &&
    /id="viewBetaFeedbackBtn"/.test(services[0]) &&
    /id="viewSupportArchiveBtn"/.test(services[0]) &&
    /id="viewFeedbackCommentsBtn"/.test(services[0]) &&
    /View Feedback comments/.test(services[0]) &&
    /id="feedbackCommentsList"/.test(services[0]),
  'Additional Services admin lists must stay hidden unless Super User, and include View Feedback comments'
);
assert.ok(
  /\.service-requests-admin \{[\s\S]*?display: none !important;/.test(styles) &&
    /body\.fire-s-service-super \.service-requests-admin/.test(styles) &&
    /function paintServiceSuperUserChrome\(/.test(app) &&
    /classList\.toggle\('fire-s-service-super'/.test(app) &&
    /function isFeedbackComment\(/.test(app) &&
    /function renderFeedbackCommentsList\(/.test(app) &&
    /!isFeedbackComment\(item\)/.test(app) &&
    /feedbackCommentsList: 'viewFeedbackCommentsBtn'/.test(app),
  'Only the Super User can open saved requests, reported issues, archive and feedback comments'
);

console.log('access-services-feedback.test.js: ok');
