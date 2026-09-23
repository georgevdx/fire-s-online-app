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

const liveHtml = read('index.html');
const liveEnv = read('fire-s-env.js');
const liveSw = read('service-worker.js');
const liveStarted = read('fire-s-get-started.js');
const liveStartedCss = read('fire-s-get-started.css');
const liveStyles = read('styles.css');
const liveApp = read('app.js');
const liveHomeRoles = read('fire-s-clean-home-roles.js');

assert.ok(
  /Version 1\.3\.67/.test(liveHtml) &&
    /appVersion: staging \? '1\.3\.27-toets' : '1\.3\.67'/.test(liveEnv) &&
    /fireS\.liveCacheDrop\.1-3-67/.test(liveHtml) &&
    /service-worker\.js\?v=108-75-live-67/.test(liveHtml) &&
    /fire-s-108-75-live-67/.test(liveSw) &&
    !/PayFast sandbox/.test(liveHtml),
  'Live must sit the Access/services build as 1.3.67 without PayFast sandbox copy'
);

const liveLogin = liveHtml.match(
  /id="fireSGetStartedLoginFields"[\s\S]*?id="fireSGetStartedResetFields"/
);
assert.ok(liveLogin, 'Live Access login fields must exist');
assert.ok(
  liveLogin[0].indexOf('First time? Create password') === -1 &&
    liveLogin[0].indexOf('id="fireSSwitchToCreateBtn"') === -1 &&
    /setCreatePasswordVisible\(false\)/.test(liveStarted) &&
    !/setCreatePasswordVisible\(true\)/.test(liveStarted),
  'Live Access must not show First time? Create password'
);

const liveGuest = liveHtml.match(
  /id="fireSGetStartedGuestFields"[\s\S]*?id="fireSGetStartedCompanyOnly"/
);
assert.ok(liveGuest, 'Live Subscribe New Company fields must exist');
assert.ok(
  /id="fireSGetStartedPassword"/.test(liveGuest[0]) &&
    /id="fireSGetStartedPassword2"/.test(liveGuest[0]) &&
    /Confirm password/.test(liveGuest[0]),
  'Live Subscribe New Company must ask the owner to confirm the password'
);

assert.ok(
  /id="cmdServicesBtn"/.test(liveHtml) &&
    /Request Fire Consultant Services/.test(liveHtml) &&
    /Request Fire Consultant Services/.test(liveHomeRoles) &&
    /#mainCommandCentre #cmdServicesBtn/.test(liveStyles) &&
    /linear-gradient\(135deg, #fde68a/.test(liveStyles) &&
    /Request Fire Consultant Services/.test(liveLogin[0]) &&
    /linear-gradient\(180deg, #fbbf24/.test(liveStartedCss),
  'Live Home and Access must show catchy Request Fire Consultant Services'
);

const liveServices = liveHtml.match(
  /id="servicesSection"[\s\S]*?id="projectListSection"/
);
assert.ok(liveServices, 'Live Additional Services section must exist');
assert.ok(
  /class="service-requests-admin" hidden/.test(liveServices[0]) &&
    /id="viewFeedbackCommentsBtn"/.test(liveServices[0]) &&
    /View Feedback comments/.test(liveServices[0]) &&
    /function paintServiceSuperUserChrome\(/.test(liveApp) &&
    /function renderFeedbackCommentsList\(/.test(liveApp),
  'Live Additional Services admin lists must stay hidden unless Super User, and include View Feedback comments'
);

console.log('access-services-feedback.test.js: ok');
