'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

function assertSubscribeFonts(label, css) {
  assert.ok(
    /\.fire-s-subscribe-status :is\(strong, p, span, small\)[\s\S]*color: #14532d !important/.test(css),
    label + ': Active subscription paper must use dark green type'
  );
  assert.ok(
    /\.fire-s-subscribe-cancel h4[\s\S]*color: #7f1d1d !important/.test(css) &&
      /\.fire-s-subscribe-cancel ol[\s\S]*color: #334155 !important/.test(css),
    label + ': Cancel this subscription heading and list must stay dark on white'
  );
  assert.ok(
    /\.fire-s-subscribe-cancel \.secondary-btn[\s\S]*color: #f8fafc !important/.test(css),
    label + ': Cancel subscription button must stay light on the dark chip'
  );
  assert.ok(
    /\.fire-s-subscribe-current strong\.is-picked[\s\S]*color: #fde68a !important/.test(css) &&
      /\.fire-s-subscribe-current span[\s\S]*color: #ffffff !important/.test(css),
    label + ': Chosen-plan navy card must stay light-on-navy'
  );
  assert.ok(
    /\.fire-s-subscribe-again h4[\s\S]*color: #14532d !important/.test(css),
    label + ': Subscribe again paper must keep dark green type'
  );
}

assertSubscribeFonts('Live styles', read('styles.css'));
assertSubscribeFonts('Live fit-text', read('fire-s-fit-text.css'));
assertSubscribeFonts('Live dark-type', read('fire-s-dark-type.css'));
assertSubscribeFonts('Toets styles', read('staging/styles.css'));
assertSubscribeFonts('Toets fit-text', read('staging/fire-s-fit-text.css'));
assertSubscribeFonts('Toets dark-type', read('staging/fire-s-dark-type.css'));

assert.strictEqual(
  read('fire-s-dark-type.css'),
  read('staging/fire-s-dark-type.css'),
  'Live and toets last-loaded Dark Mode type must stay identical'
);

assert.ok(
  /styles\.css\?v=1-3-65-count/.test(read('index.html')) &&
    /fire-s-fit-text\.css\?v=1-19-sitlive/.test(read('index.html')) &&
    /fire-s-dark-type\.css\?v=1-3-rephead/.test(read('index.html')),
  'Live must cache-bust subscription paper font CSS'
);

assert.ok(
  /styles\.css\?v=1-3-111-services/.test(read('staging/index.html')) &&
    /fire-s-fit-text\.css\?v=1-19-actovd/.test(read('staging/index.html')) &&
    /fire-s-dark-type\.css\?v=1-8-rephead/.test(read('staging/index.html')),
  'Toets must cache-bust subscription paper font CSS'
);

assert.ok(
  /Version 1\.3\.66/.test(read('index.html')) &&
    /Version 1\.3\.112-toets/.test(read('staging/index.html')),
  'Displayed versions stay 1.3.66 live and 1.3.112-toets'
);

console.log('subscribe-fonts.test.js: ok');
