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
    /fire-s-schedule-assign\.js\?v=1-3-datepicker/.test(stagingHtml) &&
    /styles\.css\?v=1-3-110-datepick/.test(stagingHtml),
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
    getElementById(id) {
      return el(id);
    },
    addEventListener() {}
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
el('followUpDate').onfocus();
assert.strictEqual(el('followUpDate').opened, true, 'Follow-up Date must also open a date picker');

console.log('schedule-date-picker.test.js: ok');
