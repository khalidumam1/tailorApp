/**
 * Hook returning the StyleSheet for the current palette. Centralised so
 * every screen that pulls `useAppStyles` rebuilds the same memoised sheet.
 */
import { useMemo } from 'react';
import { useAppTheme } from './palette';
import { createStyles, type AppStyles } from './styles';

export function useAppStyles(): AppStyles {
  const { palette } = useAppTheme();
  return useMemo(() => createStyles(palette), [palette]);
}
