import { describe, expect, it } from 'vitest';
import { filterRows, pageCount, pageSlice } from './DataTable';

type Row = { id: string; name: string; note?: string | null };

const columns = [
  { key: 'name', label: 'Name', render: (row: Row) => row.name, search: (row: Row) => row.name },
  { key: 'note', label: 'Note', render: (row: Row) => row.note ?? '', search: (row: Row) => row.note },
];

const rows: Row[] = [
  { id: '1', name: 'Shalwar Kameez', note: 'Cotton' },
  { id: '2', name: 'Waistcoat', note: 'Silk blend' },
  { id: '3', name: 'Trouser', note: null },
  { id: '4', name: 'waist coat copy', note: 'linen' },
];

describe('filterRows', () => {
  it('returns every row for an empty query', () => {
    expect(filterRows(rows, columns, '')).toEqual(rows);
    expect(filterRows(rows, columns, '   ')).toEqual(rows);
  });

  it('matches case-insensitively across searchable columns', () => {
    expect(filterRows(rows, columns, 'WAIST').map((row) => row.id)).toEqual(['2', '4']);
    expect(filterRows(rows, columns, 'cotton').map((row) => row.id)).toEqual(['1']);
  });

  it('skips columns without a search accessor and tolerates null values', () => {
    expect(filterRows(rows, columns, 'linen').map((row) => row.id)).toEqual(['4']);
    expect(filterRows(rows, columns, 'null')).toEqual([]);
  });
});

describe('pageCount', () => {
  it('always returns at least one page', () => {
    expect(pageCount(0, 25)).toBe(1);
    expect(pageCount(1, 25)).toBe(1);
    expect(pageCount(26, 25)).toBe(2);
    expect(pageCount(50, 25)).toBe(2);
  });
});

describe('pageSlice', () => {
  it('slices 1-based pages', () => {
    expect(pageSlice(rows, 1, 2).map((row) => row.id)).toEqual(['1', '2']);
    expect(pageSlice(rows, 2, 2).map((row) => row.id)).toEqual(['3', '4']);
    expect(pageSlice(rows, 3, 2)).toEqual([]);
  });

  it('clamps invalid page numbers to the first page', () => {
    expect(pageSlice(rows, 0, 3).map((row) => row.id)).toEqual(['1', '2', '3']);
    expect(pageSlice(rows, -5, 1).map((row) => row.id)).toEqual(['1']);
  });
});
