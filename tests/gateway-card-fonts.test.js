'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

function assertGatewayCardFonts(label, css, fitCss) {
  assert.ok(
    /#projectListSection \.fire-s-136a8-card \*/.test(css) &&
      /#projectListSection \.ultra-premises-card \*/.test(css) &&
      /#projectListSection \.premises-card-v118b \*/.test(css),
    label + ': every Inspection Gateway card type must restyle nested text'
  );
  assert.ok(
    /html\[data-fire-s-theme="dark"\] #projectListSection \.fire-s-136a8-card \*/.test(css) &&
      /color: #f8fafc !important/.test(css) &&
      /html\[data-fire-s-theme="light"\] #projectListSection \.ultra-premises-title/.test(css) &&
      /html\[data-fire-s-theme="light"\] #projectListSection \.fire-s-136a8-card-top strong/.test(css),
    label + ': Dark Mode must use light card text; Light Mode must use dark card text'
  );
  assert.ok(
    /Inspection Gateway cards: force readable type/.test(fitCss),
    label + ': fit-text stylesheet must keep the Gateway card contrast after styles.css'
  );
}

assertGatewayCardFonts('Live', read('styles.css'), read('fire-s-fit-text.css'));
assertGatewayCardFonts('Toets', read('staging/styles.css'), read('staging/fire-s-fit-text.css'));

console.log('gateway-card-fonts.test.js: ok');
