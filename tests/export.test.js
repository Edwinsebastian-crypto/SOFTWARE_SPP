'use strict';
// Unit test of public/js/core/export.js (XLSX / CSV / ZIP writers used by the Reports panel). No browser needed.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

global.window = {};
const exporter = require('../public/js/core/export');

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✔', name); } catch (err) { console.error('  ✘', name, '\n   ', err.stack); process.exitCode = 1; }
}

/** Minimal ZIP reader: validates the central directory and the CRC-32 of every entry. */
function readZip(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let end = buffer.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--;
  assert.ok(end >= 0, 'end of central directory not found');
  const count = view.getUint16(end + 10, true);
  let pointer = view.getUint32(end + 16, true);
  const entries = {};
  for (let i = 0; i < count; i++) {
    assert.equal(view.getUint32(pointer, true), 0x02014b50, 'bad central directory signature');
    const crc = view.getUint32(pointer + 16, true);
    const size = view.getUint32(pointer + 24, true);
    const nameLength = view.getUint16(pointer + 28, true);
    const offset = view.getUint32(pointer + 42, true);
    const name = Buffer.from(buffer.subarray(pointer + 46, pointer + 46 + nameLength)).toString('utf8');
    assert.equal(view.getUint32(offset, true), 0x04034b50, 'bad local header signature');
    const start = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true);
    const data = buffer.subarray(start, start + size);
    assert.equal(exporter.crc32(data), crc, `CRC mismatch in ${name}`);
    entries[name] = Buffer.from(data).toString('utf8');
    pointer += 46 + nameLength + view.getUint16(pointer + 30, true) + view.getUint16(pointer + 32, true);
  }
  return entries;
}

const dataset = {
  id: 'people', title: 'People / "Staff": [1]?',
  columns: [{ key: 'name', label: 'Name' }, { key: 'grade', label: 'Grade' }, { key: 'note', label: 'Note' }],
  rows: [
    { name: 'María Pérez', grade: 4.5, note: 'Says "hi", then\nleaves' },
    { name: '<b>Tom & Jerry</b>', grade: 3, note: '=HYPERLINK("http://x")' },
    { name: 'Empty', grade: null }
  ]
};

(async () => {
  console.log('# export.js');
  await test('csv: quotes, commas, line breaks, UTF-8 and formula-injection guard', () => {
    const text = exporter.csv(dataset);
    const lines = text.split('\r\n');
    assert.equal(lines[0], 'Name,Grade,Note');
    assert.equal(lines[1], 'María Pérez,4.5,"Says ""hi"", then\nleaves"');
    assert.ok(text.includes("'=HYPERLINK"), 'a text starting with = must not stay a formula');
    assert.ok(text.includes('Empty,,'));
  });

  await test('zip: valid structure and CRC, UTF-8 file names', async () => {
    const blob = exporter.zip([{ name: 'a.csv', data: 'x,y\r\n1,2\r\n' }, { name: 'año/b.txt', data: 'ñandú' }]);
    const entries = readZip(new Uint8Array(await blob.arrayBuffer()));
    assert.deepEqual(Object.keys(entries), ['a.csv', 'año/b.txt']);
    assert.equal(entries['año/b.txt'], 'ñandú');
  });

  await test('xlsx: workbook parts, sheet names sanitised and unique, values escaped', async () => {
    const second = { ...dataset, id: 'p2', title: 'People / "Staff": [1]?' };
    const blob = exporter.xlsx([dataset, second]);
    assert.equal(blob.type, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const file = new Uint8Array(await blob.arrayBuffer());
    const entries = readZip(file);
    for (const name of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']) {
      assert.ok(entries[name], `${name} missing`);
    }
    const names = [...entries['xl/workbook.xml'].matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(names.length, 2);
    assert.notEqual(names[0].toLowerCase(), names[1].toLowerCase());
    assert.ok(names.every((n) => n.length <= 31 && !/[\\/?*[\]:]/.test(n)), `invalid sheet names ${names}`);
    const sheet = entries['xl/worksheets/sheet1.xml'];
    assert.ok(sheet.includes('<v>4.5</v>'));
    assert.ok(sheet.includes('&lt;b&gt;Tom &amp; Jerry&lt;/b&gt;'));
    assert.ok(sheet.includes('<pane ySplit="1"'));
    assert.ok(sheet.includes('<autoFilter ref="A1:C4"/>'));
    // write it so the CI / the developer can open it with a spreadsheet program
    fs.writeFileSync(path.join(os.tmpdir(), 'spp-export-test.xlsx'), file);
  });

  await test('xlsx: an empty selection still produces a valid workbook', async () => {
    const entries = readZip(new Uint8Array(await exporter.xlsx([]).arrayBuffer()));
    assert.ok(entries['xl/worksheets/sheet1.xml']);
  });

  await test('xlsx: more than 26 columns use AA, AB... references', async () => {
    const columns = Array.from({ length: 30 }, (_, i) => ({ key: 'c' + i, label: 'C' + i }));
    const row = Object.fromEntries(columns.map((c, i) => [c.key, i]));
    const entries = readZip(new Uint8Array(await exporter.xlsx([{ title: 'Wide', columns, rows: [row] }]).arrayBuffer()));
    assert.ok(entries['xl/worksheets/sheet1.xml'].includes('r="AD2"'));
  });

  console.log(`\nEXPORT: ${passed} passed${process.exitCode ? ' (with failures)' : ' — ALL OK'}`);
})();
