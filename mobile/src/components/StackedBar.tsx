/**
 * Horizontal stacked bar — used to show collected vs outstanding.
 */
import { View, Text } from 'react-native';
import { useAppStyles } from '../theme/useAppStyles';
import { useAppTheme } from '../theme/palette';

type Segment = { label: string; value: number; color: string; meta?: string };

export function StackedBar({ segments }: { segments: Segment[] }) {
  const styles = useAppStyles();
  const { palette } = useAppTheme();
  const total = Math.max(1, segments.reduce((sum, s) => sum + s.value, 0));
  return (
    <View>
      <View style={{ flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: palette.surfaceSunken }}>
        {segments.map((seg, i) => (
          <View key={i} style={{ width: `${(seg.value / total) * 100}%`, backgroundColor: seg.color }} />
        ))}
      </View>
      <View style={{ marginTop: 10 }}>
        {segments.map((seg, i) => (
          <View key={i} style={[styles.barLabelRow, { marginBottom: 4 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: seg.color }} />
              <Text style={styles.barLabel}>{seg.label}</Text>
            </View>
            <Text style={styles.barValue}>{seg.meta ?? seg.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
