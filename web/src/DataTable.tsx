import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

// One column of the data table. `render` produces the cell; `search` optionally
// contributes the column's text to the client-side search box.
export interface DataTableColumn<T> {
  key: string;
  label: ReactNode;
  render: (row: T) => ReactNode;
  search?: (row: T) => string | null | undefined;
  align?: 'left' | 'right';
}

// Controlled search. When provided, the parent performs the filtering (usually a
// server query); the input is debounced so parents can fetch on change.
export interface DataTableSearch {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  inputId?: string;
  debounceMs?: number;
}

// Cursor ("server-side") pagination: the parent owns one loaded page and fetches
// the next/previous pages on demand. Used for unbounded logs such as audit history.
export interface DataTablePager {
  pageIndex: number;
  hasMore: boolean;
  onNext: () => void;
  onPrev: () => void;
  busy?: boolean;
}

export interface DataTableProps<T> {
  columns: Array<DataTableColumn<T>>;
  rows: Array<T>;
  rowKey: (row: T) => string;
  emptyText?: string;
  pageSize?: number;
  /** false hides the search box (small preview tables). Default true. */
  searchable?: boolean;
  /** Controlled search — when set, filtering is the parent's job. */
  search?: DataTableSearch;
  /** Cursor pagination — when set, rows are a single server page. */
  pager?: DataTablePager;
  /** Rendered inside tfoot, outside pagination (e.g. totals over the full data set). */
  footer?: ReactNode;
  /** Extra controls at the right of the toolbar (e.g. a "Load more" button). */
  toolbarExtra?: ReactNode;
  wrapClassName?: string;
  wrapStyle?: React.CSSProperties;
}

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/** Rows that match the query in any searchable column. */
export function filterRows<T>(
  rows: Array<T>,
  columns: Array<DataTableColumn<T>>,
  query: string,
): Array<T> {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) =>
    columns.some((column) => {
      const text = column.search?.(row);
      return typeof text === 'string' && text.toLowerCase().includes(needle);
    }));
}

/** Total number of pages for client-side pagination (always at least 1). */
export function pageCount(rowCount: number, pageSize: number): number {
  return Math.max(1, Math.ceil(rowCount / Math.max(1, pageSize)));
}

/** The slice of rows shown on a 1-based page. */
export function pageSlice<T>(rows: Array<T>, page: number, pageSize: number): Array<T> {
  const start = (Math.max(1, page) - 1) * Math.max(1, pageSize);
  return rows.slice(start, start + Math.max(1, pageSize));
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptyText = 'Nothing here yet.',
  pageSize = 25,
  searchable = true,
  search,
  pager,
  footer,
  toolbarExtra,
  wrapClassName,
  wrapStyle,
}: DataTableProps<T>) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(pageSize);
  // Draft text for the input while a controlled search is debounced.
  const [draft, setDraft] = useState(search?.value ?? '');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Adopt external resets (e.g. the parent cleared the search on view change).
    if (search && search.value !== draft && search.value === '') {
      setDraft('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search?.value]);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const onSearchInput = (value: string) => {
    setDraft(value);
    if (search) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => search.onChange(value), search.debounceMs ?? 300);
    } else {
      setQuery(value);
      setPage(1);
    }
  };

  const effectiveQuery = search ? search.value : query;
  const filtered = useMemo(
    () => (search ? rows : filterRows(rows, columns, query)),
    [search, rows, columns, query],
  );
  const totalPages = pager ? 0 : pageCount(filtered.length, size);
  const currentPage = pager ? pager.pageIndex : Math.min(page, totalPages);
  const visibleRows = pager ? rows : pageSlice(filtered, currentPage, size);
  const rangeFrom = filtered.length ? (currentPage - 1) * size + 1 : 0;
  const rangeTo = pager ? rows.length : Math.min(currentPage * size, filtered.length);

  const showSearch = searchable;
  const showSizePicker = !pager && searchable;
  const showPagerControls = pager ? true : totalPages > 1;
  const showToolbar = Boolean(toolbarExtra) || showSearch || showPagerControls;

  return (
    <div className="data-table">
      {showToolbar && (
        <div className="data-table-toolbar">
          {showSearch ? (
            <input
              type="search"
              className="data-table-search"
              id={search?.inputId}
              aria-label={typeof columns[0]?.label === 'string' ? `Search ${columns[0].label}` : 'Search table'}
              placeholder={search?.placeholder ?? 'Search…'}
              value={draft}
              onChange={(event) => onSearchInput(event.target.value)}
            />
          ) : <span />}
          <div className="data-table-toolbar-end">
            {toolbarExtra}
            {showSizePicker && (
              <label className="data-table-size">Rows
                <select
                  aria-label="Rows per page"
                  value={size}
                  onChange={(event) => { setSize(Number(event.target.value)); setPage(1); }}
                >
                  {PAGE_SIZE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
            )}
            {!pager && filtered.length > 0 && (
              <span className="data-table-count">
                {rangeFrom}–{rangeTo} of {filtered.length}
              </span>
            )}
            {showPagerControls && (
              <div className="data-table-pager">
                <button
                  type="button"
                  className="button button-quiet"
                  disabled={pager ? pager.pageIndex <= 1 || pager.busy : currentPage <= 1}
                  onClick={() => (pager ? pager.onPrev() : setPage((value) => Math.max(1, value - 1)))}
                >
                  Previous
                </button>
                <span className="data-table-count">Page {currentPage}</span>
                <button
                  type="button"
                  className="button button-quiet"
                  disabled={pager ? !pager.hasMore || pager.busy : currentPage >= totalPages}
                  onClick={() => (pager ? pager.onNext() : setPage((value) => Math.min(totalPages, value + 1)))}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      <div className={`table-wrap ${wrapClassName ?? ''}`.trim()} style={wrapStyle}>
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} style={column.align === 'right' ? { textAlign: 'right' } : undefined}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((column) => (
                  <td
                    key={column.key}
                    data-label={typeof column.label === 'string' ? column.label : column.key}
                    style={column.align === 'right' ? { textAlign: 'right' } : undefined}
                  >
                    <div className="data-table-cell-content">{column.render(row)}</div>
                  </td>
                ))}
              </tr>
            ))}
            {!visibleRows.length && (
              <tr>
                <td colSpan={columns.length} className="table-empty">
                  {effectiveQuery.trim() ? `No matches for “${effectiveQuery.trim()}”.` : emptyText}
                </td>
              </tr>
            )}
          </tbody>
          {footer && <tfoot>{footer}</tfoot>}
        </table>
      </div>
    </div>
  );
}
