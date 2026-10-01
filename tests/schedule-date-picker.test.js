'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const stagingHtml = read('staging/index.html');
const stagingCss = read('staging/styles.css');
const stagingAssign = read('staging/fire-s-schedule-assign.js');

assert.ok(
  /id="scheduleDate"[^>]*type="date"/.test(stagingHtml) &&
    /id="followUpDate"[^>]*type="date"|type="date" id="followUpDate"/.test(stagingHtml) &&
    /class="fire-s-date-input"/.test(stagingHtml) &&
    /fire-s-schedule-assign\.js\?v=1-4-date-picker/.test(stagingHtml) &&
    /fire-s-dark-type\.css\?v=1-11-date-picker/.test(stagingHtml) &&
    /styles\.css\?v=1-3-116-superonly/.test(stagingHtml),
  'Toets scheduling must keep native date inputs and cache-bust the picker CSS'
);
assert.ok(
  /color-scheme: light/.test(stagingCss) &&
    /::-webkit-calendar-picker-indicator/.test(stagingCss) &&
    /#scheduleDate|#nextInspectionCard input\[type="date"\]|input\[type="date"\]/.test(stagingCss),
  'Dark Mode must not hide the native calendar icon on white scheduling paper'
);
assert.ok(
  /function bindDatePickers\(/.test(stagingAssign) &&
    /showPicker/.test(stagingAssign) &&
    /setAttribute\('type', 'date'\)/.test(stagingAssign),
  'Tapping Scheduled Date must open the date picker'
);

const fields = {};
function el(id) {
  if (!fields[id]) {
    fields[id] = {
      id: id,
      type: 'text',
      classList: { add() {} },
      attributes: {},
      setAttribute(name, value) {
        this.attributes[name] = value;
        if (name === 'type') this.type = value;
      },
      addEventListener(name, fn) {
        this['on' + name] = fn;
      },
      showPicker() {
        this.opened = true;
      }
    };
  }
  return fields[id];
}

const sandbox = {
  document: {
    readyState: 'complete',
    listeners: {},
    getElementById(id) {
      return el(id);
    },
    addEventListener(name, fn) {
      this.listeners[name] = fn;
    }
  },
  setTimeout(fn) {
    if (typeof fn === 'function') fn();
  }
};
sandbox.window = sandbox;
sandbox.global = sandbox;
vm.runInNewContext(stagingAssign, sandbox);

assert.strictEqual(el('scheduleDate').type, 'date', 'Scheduled Date must be a date input, not a plain text box');
el('scheduleDate').onclick();
assert.strictEqual(el('scheduleDate').opened, true, 'Clicking Scheduled Date must open the native date picker');
el('followUpDate').onclick();
assert.strictEqual(el('followUpDate').opened, true, 'Follow-up Date must also open a date picker');
assert.strictEqual(typeof el('followUpDate').onfocus, 'undefined', 'Focus must not open a second picker and dismiss the first');

function dateField(extra) {
  const field = Object.assign({
    tagName: 'INPUT',
    type: 'date',
    disabled: false,
    readOnly: false,
    opened: false,
    attributes: { type: 'date' },
    classList: { add() {} },
    getAttribute(name) {
      return this.attributes[name] || '';
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
      if (name === 'type') this.type = value;
    },
    closest(sel) {
      return /date|expiry/.test(String(sel)) ? this : null;
    },
    querySelector() {
      return null;
    },
    addEventListener() {},
    showPicker() {
      this.opened = true;
    }
  }, extra || {});
  return field;
}

const expiry = dateField({ className: 'expiry-date' });
sandbox.document.listeners.click({ target: expiry });
assert.strictEqual(expiry.opened, true, 'A checklist expiry date created later must open a date picker');
assert.strictEqual(expiry.attributes.lang, 'en-ZA', 'Expiry dates must use a South African date picker');

const disabledExpiry = dateField({ disabled: true });
sandbox.document.listeners.click({ target: disabledExpiry });
assert.strictEqual(disabledExpiry.opened, false, 'An N/A expiry date stays closed');

const expiryLabel = {
  closest(sel) {
    return String(sel).indexOf('expiry-wrapper') !== -1 ? this : null;
  },
  querySelector() {
    return expiryFromLabel;
  }
};
const expiryFromLabel = dateField();
sandbox.document.listeners.click({ target: expiryLabel });
assert.strictEqual(expiryFromLabel.opened, true, 'Tapping the Expiry Date label must open the date picker');

const liveHtml = read('index.html');
const liveAssign = read('fire-s-schedule-assign.js');
const darkType = read('fire-s-dark-type.css');
assert.ok(
  /id="inspectionDate"[\s\S]*class="fire-s-date-input"[\s\S]*type="date"/.test(liveHtml) &&
    /id="followUpDate"[^>]*class="fire-s-date-input"/.test(liveHtml) &&
    /fire-s-schedule-assign\.js\?v=1-3-date-picker/.test(liveHtml) &&
    /fire-s-dark-type\.css\?v=1-6-date-picker/.test(liveHtml),
  'Live inspection dates must be native date inputs with a fresh picker script'
);
assert.ok(
  /function bindDatePickers\(/.test(liveAssign) &&
    /showPicker/.test(liveAssign) &&
    /input\.expiry-date/.test(liveAssign) &&
    !/addEventListener\('focus', openPicker\)/.test(liveAssign),
  'Live must open every date field, including checklist expiry dates, on tap'
);
assert.ok(
  /color-scheme: light !important/.test(darkType) &&
    /::-webkit-calendar-picker-indicator/.test(darkType) &&
    /input\.expiry-date/.test(darkType),
  'Dark Mode must keep the calendar icon and the date text visible'
);

console.log('schedule-date-picker.test.js: ok');
