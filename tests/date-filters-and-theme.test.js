'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const app = read('staging/app.js');
const html = read('staging/index.html');
const css = read('staging/styles.css');

function pad(n) {
  return String(n).padStart(2, '0');
}

function ymd(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function startOfWeekMonday(date) {
  const result = new Date(date);
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  result.setDate(result.getDate() + diff);
  return result;
}

function rangeFor(filter, today) {
  if (filter === 'all') return { from: '', to: '' };
  if (filter === 'today') {
    const day = ymd(today);
    return { from: day, to: day };
  }
  if (filter === 'week') {
    const start = startOfWeekMonday(today);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { from: ymd(start), to: ymd(end) };
  }
  if (filter === 'month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { from: ymd(start), to: ymd(end) };
  }
  if (filter === 'quarter') {
    const quarterStartMonth = Math.floor(today.getMonth() / 3) * 3;
    const start = new Date(today.getFullYear(), quarterStartMonth, 1);
    const end = new Date(today.getFullYear(), quarterStartMonth + 3, 0);
    return { from: ymd(start), to: ymd(end) };
  }
  if (filter === 'year') {
    const start = new Date(today.getFullYear(), 0, 1);
    const end = new Date(today.getFullYear(), 11, 31);
    return { from: ymd(start), to: ymd(end) };
  }
  throw new Error('unknown filter ' + filter);
}

function matches(projectDate, from, to) {
  if (!from && !to) return true;
  if (!projectDate) return false;
  if (from && projectDate < from) return false;
  if (to && projectDate > to) return false;
  return true;
}

const today = new Date(2026, 8, 9);
assert.strictEqual(ymd(today), '2026-09-09');
assert.deepStrictEqual(rangeFor('today', today), { from: '2026-09-09', to: '2026-09-09' });
assert.deepStrictEqual(rangeFor('week', today), { from: '2026-09-07', to: '2026-09-13' });
assert.deepStrictEqual(rangeFor('month', today), { from: '2026-09-01', to: '2026-09-30' });
assert.deepStrictEqual(rangeFor('quarter', today), { from: '2026-07-01', to: '2026-09-30' });
assert.deepStrictEqual(rangeFor('year', today), { from: '2026-01-01', to: '2026-12-31' });
assert.deepStrictEqual(rangeFor('all', today), { from: '', to: '' });

const sites = {
  today: '2026-09-09',
  week: '2026-09-07',
  month: '2026-09-01',
  quarter: '2026-07-15',
  year: '2026-02-10',
  lastYear: '2025-11-20',
  none: ''
};

function visible(filter) {
  const { from, to } = rangeFor(filter, today);
  return Object.keys(sites).filter(key => matches(sites[key], from, to)).sort();
}

assert.deepStrictEqual(visible('today'), ['today']);
assert.deepStrictEqual(visible('week'), ['today', 'week'].sort());
assert.deepStrictEqual(visible('month'), ['today', 'week', 'month'].sort());
assert.deepStrictEqual(visible('quarter'), ['today', 'week', 'month', 'quarter'].sort());
assert.deepStrictEqual(visible('year'), ['today', 'week', 'month', 'quarter', 'year'].sort());
assert.deepStrictEqual(visible('all'), Object.keys(sites).sort());
assert.ok(!matches('2026-08-31', '2026-09-01', '2026-09-30'));
assert.ok(matches('2026-09-01', '2026-09-01', '2026-09-30'));
assert.ok(matches('2026-09-30', '2026-09-01', '2026-09-30'));

assert.ok(
  /function fireSRefreshProjectsAfterDateFilter\(/.test(app) &&
    /fireS136A11RenderProjects/.test(app) &&
    /function fireSRefreshProjectsAfterDateFilter\(/.test(read('app.js')),
  'Date filter changes must refresh the current premises list renderer on toets and live'
);

assert.ok(
  /id="fireSDateFilterHow"/.test(html) &&
    /How this filter works/.test(html) &&
    /inspection date/.test(html) &&
    !/activity date/.test(html),
  'Date filter panel must explain it uses the inspection date, not last saved'
);

assert.ok(
  /id="fireSThemeLightBtn"/.test(html) &&
    /id="fireSThemeDarkBtn"/.test(html) &&
    /fireSApplyStoredTheme/.test(html),
  'Users must get a Light / Dark appearance choice'
);

assert.ok(
  /html\[data-fire-s-theme="dark"\]/.test(css) &&
    /function fireSAppearanceChoice/.test(app) &&
    /localStorage\.setItem\(STORAGE_KEY, next\)/.test(app),
  'Dark mode must persist and restyle the app'
);

assert.ok(
  /id="fireSGatewayStatusFilters"/.test(html) &&
    !/id="dashboardMetrics"/.test(html),
  'Status chips stay outside More Filters; workspace tiles are not in the markup'
);

const liveHtml = read('index.html');
const liveApp = read('app.js');
const liveCss = read('styles.css');
assert.ok(
  /id="fireSThemeLightBtn"/.test(liveHtml) &&
    /id="fireSThemeDarkBtn"/.test(liveHtml) &&
    /fireSApplyStoredTheme/.test(liveHtml) &&
    /function fireSAppearanceChoice/.test(liveApp),
  'Live must sit the same Light / Dark appearance choice'
);
assert.ok(
  liveHtml.indexOf('id="inspectionDateFilterPanel"') < liveHtml.indexOf('id="fireSGatewayStatusFilters"') &&
    html.indexOf('id="inspectionDateFilterPanel"') < html.indexOf('id="fireSGatewayStatusFilters"'),
  'Date filter must sit above the six status chips on live and toets'
);
assert.ok(
  /html\[data-fire-s-theme="dark"\]/.test(liveCss) &&
    /#mainCommandCentre \.fire-s-owner-lists-block/.test(liveCss) &&
    /#mainCommandCentre \.fire-s-owner-lists-block/.test(css),
  'Home section blocks must have frames on live and toets'
);

console.log('date-filters-and-theme.test.js: ok');
