'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const html = read('staging/index.html');
const app = read('staging/app.js');
const homeRoles = read('staging/fire-s-clean-home-roles.js');
const manual = read('staging/fire-s-user-manual.js');

const servicesBlock = html.match(
  /id="servicesSection"[\s\S]*?id="projectListSection"/
);
assert.ok(servicesBlock, 'Additional Services section must exist on the toets-blad');
const services = servicesBlock[0];

const formBlock = services.match(
  /id="betaFeedbackForm"[\s\S]*?<\/div>\s*<\/section>/
);
assert.ok(formBlock, 'Feedback form must live inside Additional Services');
const form = formBlock[0];

assert.ok(
  /<h3>Feedback<\/h3>/.test(services) &&
    /Write a comment if you reviewed the app or found a problem/.test(services) &&
    /id="openBetaFeedbackBtn"/.test(services) &&
    />\s*Write a comment\s*</.test(services),
  'Additional Services must offer a simple Feedback card for a review or a problem'
);

assert.ok(
  /<h3>Your comment<\/h3>/.test(form) &&
    /id="betaComment"/.test(form) &&
    /id="submitBetaFeedbackBtn"/.test(form) &&
    />\s*Submit\s*</.test(form) &&
    /Write your comment here/.test(form),
  'Feedback must be a comment box and Submit'
);

[
  'betaIssueType',
  'betaPriority',
  'betaDevice',
  'betaBrowser',
  'betaOnlineStatus',
  'betaInspectionNumber',
  'betaExpectedResult',
  'betaWhatHappened',
  'betaWhatHened',
  'betaAutoFillHint',
  'Issue Type',
  'Priority',
  'Device',
  'Browser',
  'Online / Offline',
  'Inspection Number',
  'Auto-filled'
].forEach(function (needle) {
  assert.ok(
    form.indexOf(needle) === -1,
    'Feedback form must not show technical field: ' + needle
  );
});

assert.ok(
  /function collectSilentFeedbackContext\(/.test(app) &&
    /getElementById\('betaComment'\)/.test(app) &&
    /issue_type: 'Comment'/.test(app) &&
    /what_happened: comment/.test(app) &&
    /setBetaFeedbackUserMessage\(\s*'Please write a comment first\.'/.test(app) &&
    /Please Login first, then send your comment/.test(app) &&
    /Could not send your comment\. Please try again/.test(app) &&
    /Comment sent\. Thank you/.test(app) &&
    !/Feedback could not be submitted: \$\{error\.message\}/.test(app) &&
    !/Feedback submit failed: \$\{error\.message\}/.test(app) &&
    !/Please login before submitting beta feedback/.test(app),
  'Submit must read the comment only and keep errors non-technical'
);

assert.ok(
  /cancelBetaFeedback\(\)/.test(
    app.slice(
      app.indexOf('function requestAdditionalService'),
      app.indexOf('function cancelServiceRequest')
    )
  ) &&
    /cancelServiceRequest\(\)/.test(
      app.slice(
        app.indexOf('function openBetaFeedbackForm'),
        app.indexOf('function cancelBetaFeedback')
      )
    ),
  'Opening Feedback or a service request must hide the other form'
);

assert.ok(
  /write a comment about the app or a problem/.test(html) &&
    /Write a comment, request review or operational support/.test(homeRoles) &&
    /a comment about the app, or support/.test(homeRoles) &&
    /write a comment if you reviewed the app or found a problem/.test(manual),
  'Home Support and the manual must point people at the comment, not technical bug fields'
);

assert.ok(
  /app\.js\?v=1-3-78-toets-comment/.test(html) &&
    /service-worker\.js\?v=108-65-toets-comment/.test(html),
  'Toets-blad must cache-bust the comment form'
);

console.log('simple-feedback-comment.test.js: ok');
