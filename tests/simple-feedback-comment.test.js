'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

function assertCommentForm(label, html, app, homeRoles, manual) {
  const servicesBlock = html.match(
    /id="servicesSection"[\s\S]*?id="projectListSection"/
  );
  assert.ok(servicesBlock, label + ': Additional Services section must exist');
  const services = servicesBlock[0];

  const formBlock = services.match(
    /id="betaFeedbackForm"[\s\S]*?<\/div>\s*<\/section>/
  );
  assert.ok(formBlock, label + ': Feedback form must live inside Additional Services');
  const form = formBlock[0];

  assert.ok(
    /<h3>Feedback<\/h3>/.test(services) &&
      /Write a comment if you reviewed the app or found a problem/.test(services) &&
      /id="openBetaFeedbackBtn"/.test(services) &&
      />\s*Write a comment\s*</.test(services) &&
      !/Report a problem/.test(services),
    label + ': Additional Services must offer a simple Feedback card'
  );

  assert.ok(
    /<h3>Your comment<\/h3>/.test(form) &&
      /id="betaComment"/.test(form) &&
      /id="submitBetaFeedbackBtn"/.test(form) &&
      />\s*Submit\s*</.test(form) &&
      /Write your comment here/.test(form),
    label + ': Feedback must be a comment box and Submit'
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
      label + ': Feedback form must not show technical field: ' + needle
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
    label + ': Submit must read the comment only and keep errors non-technical'
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
    label + ': Opening Feedback or a service request must hide the other form'
  );

  assert.ok(
    /write a comment about the app or a problem/.test(html) &&
      /Write a comment, request review or operational support/.test(homeRoles) &&
      /a comment about the app, or support/.test(homeRoles) &&
      /write a comment if you reviewed the app or found a problem/.test(manual),
    label + ': Home Support and the manual must point people at the comment'
  );
}

const stagingHtml = read('staging/index.html');
const liveHtml = read('index.html');
assertCommentForm(
  'Toets',
  stagingHtml,
  read('staging/app.js'),
  read('staging/fire-s-clean-home-roles.js'),
  read('staging/fire-s-user-manual.js')
);
assertCommentForm(
  'Live',
  liveHtml,
  read('app.js'),
  read('fire-s-clean-home-roles.js'),
  read('fire-s-user-manual.js')
);

assert.ok(
  /Version 1\.3\.91-toets/.test(stagingHtml) &&
    /app\.js\?v=1-3-91-toets-lock/.test(stagingHtml) &&
    /fire-s-env\.js\?v=1-3-91-home-lock/.test(stagingHtml) &&
    /service-worker\.js\?v=108-70-toets-91/.test(stagingHtml) &&
    /function fireSDropStuckToetsCache\(/.test(stagingHtml) &&
    /TOETS-BLAD 1\.3\.91-toets/.test(read('staging/fire-s-env.js')) &&
    /1\.3\.91-toets/.test(read('staging/fire-s-env.js')) &&
    /fire-s-108-70-toets-91/.test(read('staging/service-worker.js')),
  'Toets-blad must show 1.3.91-toets and drop the stuck 1.3.78 cache'
);

assert.ok(
  /Version 1\.3\.65/.test(liveHtml) &&
    /app\.js\?v=1-3-65-count/.test(liveHtml) &&
    /service-worker\.js\?v=108-72-count/.test(liveHtml) &&
    /fire-s-108-72-count/.test(read('service-worker.js')) &&
    /appVersion: staging \? '1\.3\.27-toets' : '1\.3\.65'/.test(read('fire-s-env.js')),
  'Live must sit the comment form without bumping 1.3.65'
);

console.log('simple-feedback-comment.test.js: ok');
