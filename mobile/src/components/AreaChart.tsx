/**
 * Tiny area-line chart. Used on the analytics and dashboard hero. Built with
 * react-native-svg (already a project dependency) so it works on both
 * platforms without extra installs.
 */
import Svg, { Defs, LinearGradient, Path, Stop, Line, Circle } from 'react-native-svg';
import { useAppTheme } from '../theme/palette';
import { View, Text } from 'react-native';
import { formatCurrency } from '../local';
import { interpolate } from '../i18n';
import { useAppStyles } from '../theme/useAppStyles';
import type { OrderValuePoint } from '../data/analytics';

type AreaChartProps = {
  data: OrderValuePoint[];
  height?: number;
  currency?: string;
  copyKey?: string; // i18n key with {0} placeholder
};

export function AreaChart({ data, height = 160, currency = 'PKR', copyKey }: AreaChartProps) {
  const { palette } = useAppTheme();
  const styles = useAppStyles();
  const width = 320; // logical width, scaled by viewBox
  const padding = { top: 18, right: 8, bottom: 22, left: 8 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  if (data.length === 0) {
    return (
      <View style={{ height, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={styles.emptyText}>—</Text>
      </View>
    );
  }

  const max = Math.max(1, ...data.map((d) => d.value));
  const min = 0;
  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;
  const yFor = (v: number) => padding.top + innerH * (1 - (v - min) / (max - min || 1));
  const xFor = (i: number) => padding.left + stepX * i;

  const linePath = data.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(1)} ${yFor(p.value).toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${xFor(data.length - 1).toFixed(1)} ${(padding.top + innerH).toFixed(1)} L ${xFor(0).toFixed(1)} ${(padding.top + innerH).toFixed(1)} Z`;
  const total = data.reduce((sum, p) => sum + p.value, 0);
  const formattedTotal = formatCurrency(total.toFixed(2), currency);

  // 3 horizontal grid lines
  const gridLines = [0.25, 0.5, 0.75].map((g) => padding.top + innerH * g);

  return (
    <View>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="area" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={palette.primary} stopOpacity="0.42" />
            <Stop offset="1" stopColor={palette.primary} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        {gridLines.map((y) => (
          <Line
            key={y}
            x1={padding.left}
            y1={y}
            x2={width - padding.right}
            y2={y}
            stroke={palette.border}
            strokeWidth="1"
            strokeDasharray="3 4"
          />
        ))}
        <Path d={areaPath} fill="url(#area)" />
        <Path d={linePath} stroke={palette.primary} strokeWidth="2.5" fill="none" />
        {data.map((p, i) => (
          <Circle key={i} cx={xFor(i)} cy={yFor(p.value)} r={i === data.length - 1 ? 5 : 2.4} fill={palette.primary} />
        ))}
      </Svg>
      <View style={styles.chartHeader}>
        <Text style={styles.chartLabel}>{copyKey ? interpolate(copyKey, formattedTotal) : formattedTotal}</Text>
      </View>
    </View>
  );
}
