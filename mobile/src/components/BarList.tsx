/**
 * Vertical bar list — used for pipeline breakdown, top items, collections.
 */
import { View, Text } from 'react-native';
import { useAppStyles } from '../theme/useAppStyles';

type BarRow = { label: string; value: number; meta?: string; color?: string };

export function BarList({ rows, max }: { rows: BarRow[]; max?: number }) {
  const styles = useAppStyles();
  const ceiling = max ?? Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) {
    return <Text style={styles.emptyText}>—</Text>;
  }
  return (
    <View>
      {rows.map((row, index) => {
        const ratio = Math.max(0, Math.min(1, row.value / ceiling));
        return (
          <View key={`${row.label}-${index}`} style={styles.barRow}>
            <View style={styles.barLabelRow}>
              <Text style={styles.barLabel}>{row.label}</Text>
              <Text style={styles.barValue}>{row.meta ?? String(row.value)}</Text>
            </View>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  { width: `${ratio * 100}%`, backgroundColor: row.color ?? undefined },
                ]}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}
