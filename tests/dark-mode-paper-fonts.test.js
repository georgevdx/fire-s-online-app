'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

function nuclearSpanRule(css) {
  const start = css.indexOf('html[data-fire-s-theme="dark"] h1');
  assert.ok(start > 0, 'dark heading rule must exist');
  const block = css.slice(start, css.indexOf('{', start));
  return /html\[data-fire-s-theme="dark"\] span/.test(block);
}

function assertDarkPaper(label, css, fitCss) {
  assert.ok(
    !nuclearSpanRule(css),
    label + ': Dark Mode must not paint every span light (that blanks white cards and reports)'
  );
  assert.ok(
    /Dark Mode: paper \(white\/light\) islands keep dark type/.test(css) &&
      /html\[data-fire-s-theme="dark"\] \.report-summary-card span/.test(css) &&
      /html\[data-fire-s-theme="dark"\] \.report-answer strong/.test(css) &&
      /\.company-team-card,/.test(css) &&
      /\.fire-s-plan-card,/.test(css) &&
      /\.pbi-kpi,/.test(css) &&
      /\.user-manual-toc,/.test(css) &&
      /\.schedule-new-panel,/.test(css),
    label + ': reports and other paper cards must keep dark type'
  );
  assert.ok(
    /html\[data-fire-s-theme="dark"\] \.report-block h3/.test(css) &&
      /html\[data-fire-s-theme="dark"\] \.report-section-heading/.test(css) &&
      /html\[data-fire-s-theme="dark"\] #reportSection > h2/.test(css),
    label + ': report headings on the dark card must stay readable'
  );
  assert.ok(
    /html\[data-fire-s-theme="dark"\] #reportContent \*/.test(css) &&
      /html\[data-fire-s-theme="dark"\] \.report-block,/.test(css) &&
      /color: #0f172a !important;/.test(css) &&
      /\.finding-item-card,/.test(css) &&
      /\.section-header \*/.test(css) &&
      /\.company-team-intro,/.test(css) &&
      /\.user-manual-intro,/.test(css) &&
      /\.fire-s-subscribe-intro,/.test(css),
    label + ': the white report document and leftover paper cards must keep dark type'
  );
  assert.ok(
    /Dark Mode: paper \(white\/light\) islands keep dark type/.test(fitCss) &&
      /html\[data-fire-s-theme="dark"\] #reportContent \*/.test(fitCss),
    label + ': fit-text must keep the paper-surface contrast after styles.css'
  );
}

assertDarkPaper('Live', read('styles.css'), read('fire-s-fit-text.css'));
assertDarkPaper('Toets', read('staging/styles.css'), read('staging/fire-s-fit-text.css'));

function assertLastLoadedDarkType(label, html, darkCss) {
  assert.ok(
    /fire-s-dark-type\.css\?v=1-0-last/.test(html),
    label + ': last Dark Mode type sheet must load'
  );
  assert.ok(
    html.indexOf('fire-s-entitlement.css') < html.indexOf('fire-s-dark-type.css'),
    label + ': dark-type.css must load after every other stylesheet'
  );
  assert.ok(
    /html\[data-fire-s-theme="dark"\] #reportContent \*/.test(darkCss) &&
      /#reportContentPdfClone/.test(darkCss) &&
      /\.pbi-shell,/.test(darkCss) &&
      /\.user-manual-print,/.test(darkCss) &&
      /\.company-letterhead-form,/.test(darkCss) &&
      /\.finding-item-card,/.test(darkCss),
    label + ': last sheet must paint reports and other paper pages dark'
  );
}

assertLastLoadedDarkType('Live', read('index.html'), read('fire-s-dark-type.css'));
assertLastLoadedDarkType('Toets', read('staging/index.html'), read('staging/fire-s-dark-type.css'));

console.log('dark-mode-paper-fonts.test.js: ok');
