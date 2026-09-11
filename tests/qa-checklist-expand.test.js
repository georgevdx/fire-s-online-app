'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

function extractNamedFunction(src, name) {
  const start = src.indexOf(`function ${name}`);
  assert.ok(start >= 0, `missing ${name}`);
  const brace = src.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`unclosed ${name}`);
}

const stagingApp = read('staging/app.js');
const stagingCss = read('staging/styles.css');
const stagingHtml = read('staging/index.html');
const stagingEnv = read('staging/fire-s-env.js');
const stagingManual = read('staging/fire-s-user-manual.js');
const stagingUnlock = read('staging/fire-s-finish-unlock.js');
const stagingDarkType = read('staging/fire-s-dark-type.css');
const liveApp = read('app.js');
const liveCss = read('styles.css');
const liveHtml = read('index.html');

assert.ok(
  /class="checklist-expand-btn"/.test(stagingApp) &&
    /class="checklist-collapse-btn"/.test(stagingApp),
  'Toets Q&A toolbar must label Expand and Collapse with visible button classes'
);
assert.ok(
  /function revealExpandedChecklistInFrame\(/.test(stagingApp) &&
    /function scheduleRevealExpandedChecklistInFrame\(/.test(stagingApp) &&
    /scheduleRevealExpandedChecklistInFrame\(\);/.test(stagingApp),
  'Toets must open the Q&A list after it renders'
);
assert.ok(
  /chkDiv\.innerHTML = html;[\s\S]{0,180}scheduleRevealExpandedChecklistInFrame\(\);/.test(stagingApp),
  'Toets must expand the Q&A list as soon as questions are painted'
);
assert.ok(
  /class="section-group"/.test(stagingApp) &&
    !/class="section-group hidden"/.test(stagingApp),
  'Toets Q&A sections must start already open'
);
assert.ok(
  /frame\.scrollTop/.test(stagingApp) &&
    /checklist-row:not\(\.fire-s-gate-hidden\)/.test(stagingApp),
  'Toets must put the first visible question inside the #checklist frame'
);
assert.ok(
  /Questions are already open/.test(stagingApp) &&
    /Choose occupancy, then answer the questions/.test(stagingApp) &&
    /Choose occupancy, then answer the questions/.test(stagingUnlock),
  'Toets copy must not tell the inspector to tap Expand first'
);
assert.ok(
  /questions start already open, with the first question in the list/.test(stagingManual),
  'Toets manual must say Q&A starts expanded'
);
assert.ok(
  /button\.checklist-expand-btn[\s\S]*min-height: 44px !important/.test(stagingCss) &&
    /button\.checklist-collapse-btn[\s\S]*min-height: 44px !important/.test(stagingCss) &&
    /button\.checklist-expand-btn[\s\S]*font-size: 16px !important/.test(stagingCss) &&
    /background: #b71c1c !important/.test(stagingCss),
  'Toets Expand and Collapse must be large Fire-S red / outlined buttons'
);
assert.ok(
  /\.checklist-expand-btn[\s\S]*color: #ffffff !important/.test(stagingDarkType),
  'Last-loaded Dark Mode type must keep Expand white on red'
);
assert.ok(
  /1\.3\.77-toets/.test(stagingHtml) &&
    /1\.3\.77-toets/.test(stagingEnv) &&
    /app\.js\?v=1-3-77-toets-qaexpand/.test(stagingHtml) &&
    /styles\.css\?v=1-3-77-toets-qaexpand/.test(stagingHtml) &&
    /fire-s-dark-type\.css\?v=1-1-qaexpand/.test(stagingHtml) &&
    /fire-s-finish-unlock\.js\?v=1-1-qaexpand/.test(stagingHtml),
  'Toets must cache-bust the Q&A expand build as 1.3.77-toets'
);

assert.ok(
  !/checklist-expand-btn/.test(liveApp) &&
    !/revealExpandedChecklistInFrame/.test(liveApp) &&
    /class="section-group hidden"/.test(liveApp) &&
    /Click <strong>Expand<\/strong> to access questions/.test(liveApp),
  'Live Q&A must stay collapsed until sit live'
);
assert.ok(
  !/button\.checklist-expand-btn/.test(liveCss) &&
    /Version 1\.3\.64/.test(liveHtml),
  'Live styles and version must not pick up the toets Q&A expand'
);

const revealSrc = extractNamedFunction(stagingApp, 'revealExpandedChecklistInFrame');
const expandSrc = extractNamedFunction(stagingApp, 'expandAllSections');

const firstQuestion = {
  classList: { contains() { return false; }, add() {}, remove() {} },
  getBoundingClientRect() {
    return { top: 140, bottom: 240, left: 0, right: 0, width: 320, height: 100 };
  }
};
const section = {
  classList: {
    hidden: false,
    contains(name) { return name === 'hidden' ? this.hidden : false; },
    remove(name) { if (name === 'hidden') this.hidden = false; },
    add(name) { if (name === 'hidden') this.hidden = true; }
  },
  querySelector(sel) {
    if (sel.includes('checklist-row')) return firstQuestion;
    return null;
  }
};
const frame = {
  scrollTop: 80,
  getBoundingClientRect() {
    return { top: 80, bottom: 480, left: 0, right: 0, width: 320, height: 400 };
  },
  querySelector(sel) {
    assert.ok(
      sel.includes('#checklist') === false,
      'first question lookup is scoped to the frame'
    );
    if (sel.includes('checklist-row')) return firstQuestion;
    return firstQuestion;
  },
  querySelectorAll(sel) {
    if (sel.includes('section-group')) return [section];
    if (sel.includes('checklist-row')) return [firstQuestion];
    if (sel.includes('arrow_') || sel.includes('checklist-question-nav')) return [];
    return [];
  }
};
const nodes = {
  checklist: frame,
  section_0: section
};

const sandbox = {
  document: {
    getElementById(id) { return nodes[id] || null; },
    querySelectorAll(sel) {
      if (sel === '.section-group') return [section];
      if (sel.startsWith('[id^="arrow_"]')) return [];
      if (sel === '.checklist-question-nav') return [];
      if (sel === '.checklist-row') return [firstQuestion];
      return [];
    }
  }
};
sandbox.window = sandbox;
vm.runInNewContext(expandSrc + '\n' + revealSrc + '\nrevealExpandedChecklistInFrame();', sandbox);

assert.strictEqual(
  section.classList.hidden,
  false,
  'Reveal must leave the first Q&A section open'
);
assert.strictEqual(
  frame.scrollTop,
  132,
  'Reveal must scroll the first question to the top of the #checklist frame'
);

console.log('qa-checklist-expand.test.js: ok');
