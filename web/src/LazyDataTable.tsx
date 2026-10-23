import { lazy, Suspense, type ComponentType } from 'react';
import type { DataTableProps } from './DataTable';

const DataTableImplementation = lazy(() => import('./DataTable').then((module) => ({ default: module.DataTable })));

/** Keeps the generic row API intact while the table implementation loads on demand. */
export function DataTable<T>(props: DataTableProps<T>) {
  const Component = DataTableImplementation as unknown as ComponentType<DataTableProps<T>>;
  return (
    <Suspense fallback={<div className="loading-state" role="status">Loading table…</div>}>
      <Component {...props} />
    </Suspense>
  );
}
