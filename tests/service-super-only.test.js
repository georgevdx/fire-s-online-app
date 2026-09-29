'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

function element(id) {
  return {
    id: id,
    hidden: false,
    style: { display: '' },
    innerHTML: '<div class="service-request-card">Private request</div>',
    classList: { toggle() {} },
    setAttribute(name, value) { if (name === 'hidden') this.hidden = true; },
    removeAttribute(name) { if (name === 'hidden') this.hidden = false; },
    getAttribute(name) { return name === 'hidden' && this.hidden ? '' : null; }
  };
}

function page(profile) {
  const ids = [
    'viewServiceRequestsBtn',
    'viewBetaFeedbackBtn',
    'viewFeedbackCommentsBtn',
    'viewSupportArchiveBtn',
    'serviceRequestsSuperUserNote',
    'supportArchiveNote',
    'serviceRequestsList',
    'betaFeedbackList',
    'feedbackCommentsList',
    'supportArchiveList'
  ];
  const els = {};
  ids.forEach(id => { els[id] = element(id); });
  const admin = {
    hidden: false,
    setAttribute(name) { if (name === 'hidden') this.hidden = true; },
    removeAttribute(name) { if (name === 'hidden') this.hidden = false; }
  };
  const body = {
    className: '',
    classList: {
      toggle(name, on) {
        const parts = body.className.split(/\s+/).filter(Boolean).filter(part => part !== name);
        if (on) parts.push(name);
        body.className = parts.join(' ');
      }
    }
  };
  const context = {
    console,
    currentUserProfile: profile,
    document: {
      body: body,
      getElementById(id) { return els[id] || null; },
      querySelector(sel) {
        return sel === '#servicesSection .service-requests-admin' ? admin : null;
      }
    }
  };
  context.window = context;
  vm.runInNewContext(read('staging/fire-s-service-super-only.js'), context, {
    filename: 'fire-s-service-super-only.js'
  });
  return { context, els, admin, body };
}

function hiddenLists(els) {
  return ['serviceRequestsList', 'betaFeedbackList', 'feedbackCommentsList', 'supportArchiveList']
    .every(id => els[id].style.display === 'none' && els[id].innerHTML === '');
}

[
  null,
  { email: '' },
  { email: 'inspector@company.co.za' },
  { email: 'johandb1974ik@gmail.com' },
  { email: 'johandb@live.com' },
  { email: ' georgevdx@gmail.com.invalid ' }
].forEach(profile => {
  const view = page(profile);
  assert.strictEqual(view.body.className.includes('fire-s-service-super'), false, JSON.stringify(profile));
  assert.strictEqual(view.admin.hidden, true);
  assert.strictEqual(hiddenLists(view.els), true, 'private lists must be cleared');
});

['georgevdx@gmail.com', 'GEORGEVDX@hotmail.com', '  georgevdx@gmail.com  '].forEach(email => {
  const view = page({ email: email });
  assert.strictEqual(view.body.className.includes('fire-s-service-super'), true, email);
  assert.strictEqual(view.admin.hidden, false, email);
  assert.strictEqual(view.els.serviceRequestsList.innerHTML.includes('Private request'), true, email);
});

const styles = read('staging/styles.css');
const html = read('staging/index.html');
assert.ok(/body:not\(\.fire-s-service-super\) #viewServiceRequestsBtn/.test(styles));
assert.ok(/body:not\(\.fire-s-service-super\) #viewFeedbackCommentsBtn/.test(styles));
assert.ok(/body:not\(\.fire-s-service-super\) #viewSupportArchiveBtn/.test(styles));
assert.ok(/fire-s-service-super-only\.js\?v=1-0-superonly/.test(html));
assert.ok(!/fire-s-service-super-only/.test(read('index.html')), 'live must stay unchanged');

console.log('service-super-only.test.js: ok');
