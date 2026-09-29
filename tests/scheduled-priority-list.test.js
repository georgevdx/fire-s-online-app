'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const inspector = read('staging/inspector-v4.js');
const css = read('staging/inspector-v4.css');
const env = read('staging/fire-s-env.js');
const liveEnv = read('fire-s-env.js');
const assign = read('staging/fire-s-schedule-assign.js');
const manual = read('staging/fire-s-user-manual.js');

assert.ok(/1\.3\.119-toets/.test(env), 'Toets-blad version must stay on 1.3.119-toets');
assert.ok(
  /appVersion: staging \? '1\.3\.27-toets' : '1\.3\.67'/.test(liveEnv),
  'Live Fire-S must be 1.3.67 after sit dit live'
);
assert.ok(
  /Scheduled priority/.test(read('inspector-v4.js')) &&
    /function openList\(/.test(read('inspector-v4.js')) &&
    /function bindCards\(/.test(read('inspector-v4.js')) &&
    !/const open=openList\(/.test(read('inspector-v4.js')) &&
    /inspector-v4\.js\?v=4-10-live-open/.test(read('index.html')),
  'Live Scheduled priority CONTINUE must open the inspection'
);

assert.ok(
  /Scheduled priority/.test(inspector) &&
    /function openList\(/.test(inspector) &&
    /fireSScheduledPriorityList/.test(inspector) &&
    /inspector-v4-list/.test(inspector) &&
    /Finish one and it leaves this list/.test(inspector),
  'Inspector Home must list open bookings under Scheduled priority'
);
assert.ok(
  /inspector-v4-list/.test(css),
  'The scheduled list must stack as a phone-friendly column'
);
assert.ok(
  /Scheduled priority/.test(manual) &&
    /leaves this list/.test(manual),
  'User manual must say the list drops a finalised inspection'
);

const sandbox = { window: {}, console, setTimeout: fn => fn() };
sandbox.window = sandbox;
vm.runInNewContext(assign, sandbox);

const sample = { email: 'samplejdb@outlook.com', id: 'insp-1' };
const list = sandbox.fireSScheduledPriorityList(
  [
    {
      id: 'later',
      projectName: 'Shop 20',
      scheduledDate: '2026-09-10',
      assignedInspectorEmail: 'samplejdb@outlook.com'
    },
    {
      id: 'done',
      projectName: 'Done site',
      scheduledDate: '2026-08-01',
      assignedInspectorEmail: 'samplejdb@outlook.com',
      completedAt: '2026-08-20T10:00:00.000Z'
    },
    {
      id: 'soon',
      projectName: 'Shop 12',
      scheduledDate: '2026-08-26',
      assignedInspectorEmail: 'samplejdb@outlook.com'
    },
    {
      id: 'other',
      projectName: 'Test1 Val',
      scheduledDate: '2026-08-02',
      createdByEmail: 'johandb@live.com'
    }
  ],
  sample
);

assert.ok(list.length === 2, 'List must keep two open bookings and drop the finalised one');
assert.ok(list[0].id === 'soon' && list[1].id === 'later', 'Soonest scheduled date is first (scheduled priority)');
assert.ok(
  !list.some(item => item.id === 'done' || item.id === 'other'),
  'Finalised work and someone else’s booking must leave the inspector list'
);
assert.ok(
  sandbox.fireSIsFinalizedInspection({ completedAt: '2026-08-20' }) &&
    sandbox.fireSIsFinalizedInspection({ finalisedAt: '2026-08-20' }) &&
    !sandbox.fireSIsFinalizedInspection({ scheduledDate: '2026-08-26' }),
  'Finalised means completed or finalised, not merely scheduled'
);

assert.ok(
  !/const open=openList\(/.test(inspector) &&
    /const bookings=openList\(all\)/.test(inspector) &&
    /function bindCards\(/.test(inspector),
  'CONTINUE must call the open function, not the booking list'
);

function enhance(node) {
  node.children = [];
  node.dataset = node.dataset || {};
  node.attributes = {};
  node.style = { setProperty(key, value) { this[key] = value; } };
  node.classList = {
    add(name) {
      node._classes = node._classes || {};
      node._classes[name] = true;
    },
    remove(name) {
      if (node._classes) delete node._classes[name];
    },
    contains(name) {
      return !!(node._classes && node._classes[name]);
    }
  };
  node.setAttribute = function (key, value) {
    node.attributes[key] = String(value);
  };
  node.getAttribute = function (key) {
    return node.attributes[key];
  };
  node.removeAttribute = function (key) {
    delete node.attributes[key];
  };
  node.appendChild = function (child) {
    child.parentNode = node;
    node.children.push(child);
    return child;
  };
  node.insertBefore = function (child, ref) {
    child.parentNode = node;
    const index = node.children.indexOf(ref);
    if (index < 0) node.children.push(child);
    else node.children.splice(index, 0, child);
    return child;
  };
  node.querySelector = function (sel) {
    return queryAll(node, sel)[0] || null;
  };
  node.querySelectorAll = function (sel) {
    return queryAll(node, sel);
  };
  node.addEventListener = function (type, fn) {
    node._listeners = node._listeners || {};
    node._listeners[type] = node._listeners[type] || [];
    node._listeners[type].push(fn);
  };
  Object.defineProperty(node, 'innerHTML', {
    configurable: true,
    get() {
      return node._html || '';
    },
    set(html) {
      node._html = String(html);
      node.children = [];
      const re = /<([a-zA-Z0-9]+)\b([^>]*)>/g;
      let match;
      while ((match = re.exec(html))) {
        const child = enhance({
          tag: match[1].toLowerCase(),
          id: '',
          className: '',
          value: '',
          textContent: ''
        });
        const attrs = match[2];
        const idMatch = /\bid="([^"]*)"/.exec(attrs);
        if (idMatch) child.id = idMatch[1];
        const classMatch = /\bclass="([^"]*)"/.exec(attrs);
        if (classMatch) child.className = classMatch[1];
        const openMatch = /\bdata-v4-open="([^"]*)"/.exec(attrs);
        if (openMatch) child.dataset.v4Open = openMatch[1];
        node.appendChild(child);
      }
    }
  });
  return node;
}

function walk(node, visit) {
  visit(node);
  (node.children || []).forEach(child => walk(child, visit));
}

function matches(node, sel) {
  if (sel === '[data-v4-open]') return !!(node.dataset && node.dataset.v4Open);
  if (sel.charAt(0) === '#') return node.id === sel.slice(1);
  if (sel.charAt(0) === '.') {
    return String(node.className || '').split(/\s+/).indexOf(sel.slice(1)) !== -1;
  }
  return false;
}

function queryAll(root, sel) {
  const out = [];
  walk(root, node => {
    if (node !== root && matches(node, sel)) out.push(node);
  });
  return out;
}

const body = enhance({
  tag: 'body',
  id: '',
  className: '',
  dataset: { fireSCleanHomeRole: 'inspector' }
});
const centre = enhance({ tag: 'div', id: 'mainCommandCentre', className: '' });
body.appendChild(centre);
const documentStub = {
  body,
  readyState: 'complete',
  createElement() {
    return enhance({ tag: 'div', id: '', className: '', value: '', textContent: '' });
  },
  getElementById(id) {
    let found = null;
    walk(body, node => {
      if (node.id === id) found = node;
    });
    return found;
  },
  querySelector(sel) {
    return queryAll(body, sel)[0] || null;
  },
  querySelectorAll(sel) {
    return queryAll(body, sel);
  },
  addEventListener() {}
};

const opened = [];
const mine = {
  id: 'soon',
  projectName: 'Shop 12',
  siteName: 'Floor',
  scheduledDate: '2026-08-26',
  assignedInspectorEmail: 'insp@example.com'
};
const later = {
  id: 'later',
  projectName: 'Shop 20',
  scheduledDate: '2026-09-10',
  assignedInspectorEmail: 'insp@example.com'
};
const other = {
  id: 'other',
  projectName: 'Warehouse',
  scheduledDate: '2026-08-02',
  assignedInspectorEmail: 'other@example.com'
};
const ui = {
  console,
  setTimeout(fn) {
    return fn();
  },
  document: documentStub,
  currentUserProfile: { role: 'inspector', email: 'insp@example.com', id: 'i1' },
  fireSIsMyInspection: sandbox.fireSIsMyInspection,
  fireSScheduledPriorityList: sandbox.fireSScheduledPriorityList,
  fireSIsFinalizedInspection: sandbox.fireSIsFinalizedInspection,
  getProjects() {
    return [later, mine, other];
  },
  getVisibleProjectsForCurrentUser(list) {
    return list;
  },
  openProject(id) {
    opened.push(id);
  }
};
ui.window = ui;
vm.runInNewContext(inspector, ui);
ui.fireSInspectorV4();

const cards = documentStub.querySelectorAll('[data-v4-open]');
assert.deepStrictEqual(
  cards.map(card => card.dataset.v4Open),
  ['soon', 'later'],
  'Scheduled priority shows this inspector’s bookings, soonest first'
);
assert.ok(
  cards[0].className === 'inspector-v4-next' &&
    /CONTINUE/.test(documentStub.getElementById('inspectorV4Next')._html || ''),
  'The first card is Scheduled priority and offers CONTINUE'
);
cards[0].onclick({ preventDefault() {} });
assert.deepStrictEqual(opened, ['soon'], 'CONTINUE opens that inspection');

const search = documentStub.getElementById('inspectorV4Search');
search.value = 'shop 20';
search._listeners.input.forEach(fn => fn());
const searched = documentStub.querySelectorAll('[data-v4-open]');
assert.deepStrictEqual(
  searched.map(card => card.dataset.v4Open),
  ['later'],
  'Search still lists the matching booking'
);
searched[0].onclick({ preventDefault() {} });
assert.deepStrictEqual(opened, ['soon', 'later'], 'A search card opens the matching inspection');

documentStub.body.dataset.fireSCleanHomeRole = 'manager';
documentStub.body.classList.add('fire-s-role-manager');
ui.currentUserProfile = { role: 'manager', email: 'boss@example.com', id: 'mgr' };
ui.fireSInspectorV4();
const roster = documentStub.getElementById('fireSManagementPriority');
const rosterHtml = (roster && roster._html) || '';
assert.ok(roster && /Scheduled priority/.test(rosterHtml), 'Manager Home shows Scheduled priority');
assert.ok(
  /Shop 12/.test(rosterHtml) &&
    /insp@example.com/.test(rosterHtml) &&
    /2026-08-26/.test(rosterHtml),
  'Scheduled priority shows the inspection, who it is booked for, and the date'
);
assert.ok(
  /Warehouse/.test(rosterHtml) && /other@example.com/.test(rosterHtml) && /2026-08-02/.test(rosterHtml),
  'Manager Scheduled priority includes every inspector’s booking'
);
assert.ok(
  rosterHtml.indexOf('Warehouse') < rosterHtml.indexOf('Shop 12'),
  'Soonest date stays first'
);

console.log('scheduled-priority-list.test.js: ok');
