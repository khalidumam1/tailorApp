import assert from 'node:assert/strict';
import { test } from 'node:test';
import { csvCell, toCsv } from '../src/csv.ts';

test('csv quoting escapes quotes, commas and newlines', () => {
  assert.equal(csvCell('Say "hi", then\ngo'), '"Say ""hi"", then\ngo"');
  assert.equal(csvCell('plain'), '"plain"');
  assert.equal(csvCell(null), '""');
  assert.equal(csvCell(1250.5), '"1250.5"');
});

test('csv cells neutralise spreadsheet formula injection', () => {
  assert.equal(csvCell('=2+5'), '"\'=2+5"');
  assert.equal(csvCell('  +SUM(A1:A2)'), '"\'  +SUM(A1:A2)"');
  assert.equal(csvCell('@handle'), '"\'@handle"');
  assert.equal(csvCell('-10.00'), '"\'-10.00"');
  // A negative amount mid-string is not a formula start and stays untouched.
  assert.equal(csvCell('Refund -10.00'), '"Refund -10.00"');
});

test('toCsv joins rows with CRLF and no trailing newline', () => {
  assert.equal(
    toCsv([['Name', 'Phone'], ['Ahmed', '0300'], ['=cmd', 'x']]),
    '"Name","Phone"\r\n"Ahmed","0300"\r\n"\'=cmd","x"',
  );
});
