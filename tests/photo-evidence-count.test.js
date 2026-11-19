'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

function loadCounter(file) {
  const source = read(file);
  const start = source.indexOf('function fireSPhotoEvidenceKey');
  const endMarker = 'window.fireSEvidencePhotoCountList = fireSEvidencePhotoCountList;';
  const end = source.indexOf(endMarker);
  assert.ok(start !== -1 && end !== -1, file + ' must define the unique photo count');
  const sandbox = { window: {} };
  vm.runInNewContext(source.slice(start, end + endMarker.length), sandbox);
  return sandbox;
}

function photo(id, extra) {
  return Object.assign({ id: id, timestamp: '2026-11-19T10:00:0' + id + 'Z', note: '' }, extra || {});
}

const three = [photo('a'), photo('b'), photo('c')];
const finished = {
  id: 'premises-1',
  inspectionNumber: 'FS-100',
  photos: three,
  inspectionHistory: [{
    inspectionNumber: 'FS-100',
    photos: three.map(item => Object.assign({}, item))
  }]
};

['app.js', 'staging/app.js'].forEach(file => {
  const counter = loadCounter(file);
  assert.strictEqual(counter.fireSEvidencePhotoCount(finished), 3, file + ' counts a finished visit once');
  assert.strictEqual(counter.fireSEvidencePhotoCount({
    inspectionNumber: 'FS-200',
    photos: [photo('new')],
    inspectionHistory: [{
      inspectionNumber: 'FS-100',
      photos: three
    }]
  }), 4, file + ' keeps photos from an earlier visit');
  assert.strictEqual(counter.fireSEvidencePhotoCount({
    photos: [
      { id: 'local-1', storagePath: 'user/premises/1.jpg' },
      { id: 'cloud-1', storagePath: 'user/premises/1.jpg' }
    ]
  }), 1, file + ' counts one stored file once');
  assert.strictEqual(counter.fireSEvidencePhotoCount({
    inspectionNumber: 'FS-100',
    photos: [
      { src: 'data:image/jpeg;base64,aaa', timestamp: 't1' },
      { src: 'data:image/jpeg;base64,bbb', timestamp: 't2' },
      { src: 'data:image/jpeg;base64,ccc', timestamp: 't3' }
    ],
    inspectionHistory: [{
      inspectionNumber: 'FS-100',
      photos: [
        { src: 'data:image/jpeg;base64,aaa', timestamp: 't1' },
        { src: 'data:image/jpeg;base64,bbb', timestamp: 't2' },
        { src: 'data:image/jpeg;base64,ccc', timestamp: 't3' }
      ]
    }]
  }), 3, file + ' does not double photos that have no id');
  assert.strictEqual(counter.fireSEvidencePhotoCountList([
    finished,
    {
      id: 'premises-2',
      inspectionNumber: 'FS-100',
      photos: three.map(item => Object.assign({}, item))
    }
  ]), 3, file + ' counts the same photos once across visible premises');
  assert.strictEqual(counter.fireSEvidencePhotoCountList([
    { photos: [photo('a'), photo('b'), photo('c')] },
    { photos: [photo('d')] }
  ]), 4, file + ' still adds photos that belong to another premises');
});

const live = read('app.js');
assert.ok(
  /const photos = typeof fireSEvidencePhotoCountList === 'function'[\s\S]{0,180}fireSEvidencePhotoCountList\(unique\)/.test(live),
  'The premises overview must use the unique photo total'
);
assert.ok(
  /stat\('Photos', data\.photos/.test(live) && /on file/.test(live),
  'The premises overview keeps the Photos tile'
);

console.log('photo-evidence-count.test.js: ok');
