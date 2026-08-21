'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

function extractNamedFunction(src, name) {
  const start = src.indexOf(`async function ${name}`);
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

const appSrc = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
assert.ok(
  /await downloadGeneratedPdf\(pdf, fileName\)/.test(appSrc),
  'Export PDF must save through downloadGeneratedPdf'
);
assert.ok(
  !/pdf\.save\(fileName\)/.test(appSrc),
  'desktop-only pdf.save must not remain on Export PDF'
);

const downloadSrc = extractNamedFunction(appSrc, 'downloadGeneratedPdf');

function runDownload(options) {
  const clicks = [];
  const opens = [];
  const shares = [];
  const sandbox = {
    File: class File {
      constructor(parts, name, props) {
        this.parts = parts;
        this.name = name;
        this.type = props && props.type;
      }
    },
    URL: {
      createObjectURL() {
        return 'blob:pdf-test';
      },
      revokeObjectURL() {}
    },
    navigator: {
      userAgent: options.userAgent,
      canShare: options.canShare
        ? () => true
        : undefined,
      share: options.canShare
        ? async payload => {
            shares.push(payload);
          }
        : undefined
    },
    document: {
      createElement(tag) {
        const el = {
          tag,
          style: {},
          click() {
            clicks.push(el);
          },
          remove() {}
        };
        return el;
      },
      body: {
        appendChild() {},
      }
    },
    window: {
      open(url, target) {
        opens.push({ url, target });
      }
    },
    setTimeout(fn) {
      fn();
    }
  };
  sandbox.window.navigator = sandbox.navigator;
  vm.runInNewContext(
    `${downloadSrc}\nthis.downloadGeneratedPdf = downloadGeneratedPdf;`,
    sandbox
  );
  const pdf = {
    output(type) {
      assert.strictEqual(type, 'blob');
      return { size: 12 };
    }
  };
  return Promise.resolve(sandbox.downloadGeneratedPdf(pdf, 'Site_Report.pdf')).then(() => ({
    clicks,
    opens,
    shares
  }));
}

Promise.resolve()
  .then(() => runDownload({
    userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/120',
    canShare: true
  }))
  .then(result => {
    assert.strictEqual(result.shares.length, 1, 'Android must offer the PDF share sheet');
    assert.strictEqual(result.clicks.length, 0);
    assert.strictEqual(result.opens.length, 0);
  })
  .then(() => runDownload({
    userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/120',
    canShare: false
  }))
  .then(result => {
    assert.strictEqual(result.clicks.length, 1, 'Android without share must tap a download link');
    assert.strictEqual(result.clicks[0].download, 'Site_Report.pdf');
    assert.strictEqual(result.opens.length, 0);
  })
  .then(() => runDownload({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    canShare: false
  }))
  .then(result => {
    assert.strictEqual(result.opens.length, 1, 'iPhone without share must open the PDF');
    assert.strictEqual(result.opens[0].url, 'blob:pdf-test');
    assert.strictEqual(result.clicks.length, 0);
  })
  .then(() => {
    console.log('phone-pdf-download.test.js ok');
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
