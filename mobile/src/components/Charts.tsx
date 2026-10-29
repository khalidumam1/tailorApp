/**
 * Charts for Bizora mobile.
 *
 * Pure SVG through `react-native-svg` (already a dependency) — no charting
 * library, no webview. Every series defaults to the brand colour and falls
 * back to a categorical ramp that stays legible in both themes.
 *
 * Geometry helpers are shared with the web console so a trend line looks the
 * same on both clients: identical monotone-cubic smoothing, identical padding.
 */
import { useId, useMemo } from 'react';
import { View, Text } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';
import { useAppTheme } from '../theme/palette';
import { useAppStyles } from '../theme/useAppStyles';

type Point = { x: number; y: number };

/** Monotone-ish cubic smoothing; mirrors the web console's chart geometry. */
function smoothPath(points: Point[], tension = 0.28): string {
  if (points.length === 0) return '';
  if (points.length < 3) {
    return points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`).join(' ');
  }
  let path = `M${points[0].x},${points[0].y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const previous = points[index - 1] ?? current;
    const afterNext = points[index + 2] ?? next;
    const control1x = current.x + (next.x - previous.x) * tension;
    const control1y = current.y + (next.y - previous.y) * tension;
    const control2x = next.x - (afterNext.x - current.x) * tension;
    const control2y = next.y - (afterNext.y - current.y) * tension;
    path += ` C${control1x.toFixed(2)},${control1y.toFixed(2)} ${control2x.toFixed(2)},${control2y.toFixed(2)} ${next.x.toFixed(2)},${next.y.toFixed(2)}`;
  }
  return path;
}

function toValues(data: ReadonlyArray<number | { value: number }>): number[] {
  return data.map((entry) => (typeof entry === 'number' ? entry : entry.value));
}

/* ------------------------------------------------------------------ */
/* Sparkline — tiny trend line for KPI tiles.                          */
/* ------------------------------------------------------------------ */

export function Sparkline({
  data,
  height = 28,
  color,
  fill = true,
}: {
  data: ReadonlyArray<number>;
  height?: number;
  color?: string;
  fill?: boolean;
}) {
  const { palette } = useAppTheme();
  const gradientId = useId();
  const width = 100;
  const stroke = color ?? palette.brand600;

  if (data.length < 2) return <View style={{ height }} />;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;
  const pad = 3;
  const innerH = height - pad * 2;
  const stepX = width / (data.length - 1);
  const points: Point[] = data.map((value, index) => ({
    x: index * stepX,
    y: pad + innerH * (1 - (value - min) / span),
  }));
  const line = smoothPath(points, 0.2);
  const area = `${line} L${width},${height} L0,${height} Z`;

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <Defs>
        <LinearGradient id={`spark-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={stroke} stopOpacity="0.26" />
          <Stop offset="1" stopColor={stroke} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      {fill ? <Path d={area} fill={`url(#spark-${gradientId})`} /> : null}
      <Path d={line} stroke={stroke} strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </Svg>
  );
}

/* ------------------------------------------------------------------ */
/* Area chart — the dashboard's main trend visual.                     */
/* ------------------------------------------------------------------ */

export type AreaSeries = { label?: string; value: number };

export function AreaChart({
  data,
  height = 150,
  color,
  formatValue,
  showDots = true,
}: {
  data: ReadonlyArray<number | AreaSeries>;
  height?: number;
  color?: string;
  formatValue?: (value: number) => string;
  showDots?: boolean;
}) {
  const { palette } = useAppTheme();
  const styles = useAppStyles();
  const gradientId = useId();

  const values = useMemo(() => toValues(data), [data]);
  const labels = useMemo(
    () => (data.length > 0 && typeof data[0] === 'object' ? (data as AreaSeries[]).map((entry) => entry.label ?? '') : []),
    [data],
  );

  if (values.length === 0) {
    return (
      <View style={{ height, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={styles.emptyText}>—</Text>
      </View>
    );
  }

  const width = 320;
  const padding = { top: 16, right: 10, bottom: 24, left: 10 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const max = Math.max(1, ...values);
  const stepX = values.length > 1 ? innerW / (values.length - 1) : 0;
  const yFor = (value: number) => padding.top + innerH * (1 - value / max);
  const xFor = (index: number) => padding.left + stepX * index;

  const stroke = color ?? palette.brand600;
  const points: Point[] = values.map((value, index) => ({ x: xFor(index), y: yFor(value) }));
  const line = smoothPath(points);
  const area = `${line} L${xFor(values.length - 1).toFixed(2)},${(padding.top + innerH).toFixed(2)} L${xFor(0).toFixed(2)},${(padding.top + innerH).toFixed(2)} Z`;
  const gridLines = [0.25, 0.5, 0.75].map((ratio) => padding.top + innerH * ratio);
  const last = points[points.length - 1];

  return (
    <View>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={`area-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={stroke} stopOpacity="0.28" />
            <Stop offset="1" stopColor={stroke} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        {gridLines.map((y) => (
          <Line
            key={y}
            x1={padding.left}
            y1={y}
            x2={width - padding.right}
            y2={y}
            stroke={palette.lineSoft}
            strokeWidth="1"
            strokeDasharray="3 4"
          />
        ))}
        <Path d={area} fill={`url(#area-${gradientId})`} />
        <Path d={line} stroke={stroke} strokeWidth="2.4" fill="none" strokeLinecap="round" />
        {showDots ? <Circle cx={last.x} cy={last.y} r={4.5} fill={palette.surface} stroke={stroke} strokeWidth="2.4" /> : null}
      </Svg>
      {labels.length > 0 ? (
        <View style={styles.chartFooter}>
          <Text style={styles.chartFooterLabel} numberOfLines={1}>{labels[0]}</Text>
          {labels.length > 2 ? (
            <Text style={styles.chartFooterLabel} numberOfLines={1}>{labels[Math.floor((labels.length - 1) / 2)]}</Text>
          ) : null}
          <Text style={styles.chartFooterLabel} numberOfLines={1}>{labels[labels.length - 1]}</Text>
        </View>
      ) : null}
      {formatValue ? null : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Bar list — ranked rows with a proportional track.                   */
/* ------------------------------------------------------------------ */

export type BarRow = { label: string; value: number; meta?: string; color?: string };

export function BarList({ rows, max }: { rows: BarRow[]; max?: number }) {
  const styles = useAppStyles();
  const { palette } = useAppTheme();
  const ceiling = max ?? Math.max(1, ...rows.map((row) => row.value));
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
              <Text style={styles.barLabel} numberOfLines={1}>{row.label}</Text>
              <Text style={styles.barValue}>{row.meta ?? String(row.value)}</Text>
            </View>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  { width: `${ratio * 100}%`, backgroundColor: row.color ?? palette.brand600 },
                ]}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Donut — share-of-total with a legend.                               */
/* ------------------------------------------------------------------ */

export type DonutSegment = { label: string; value: number; color?: string };

export function DonutChart({
  segments,
  size = 132,
  thickness = 16,
  centerLabel,
  centerValue,
}: {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const { palette } = useAppTheme();
  const styles = useAppStyles();

  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0);
  const radius = (size - thickness) / 2;
  const center = size / 2;

  if (total <= 0 || segments.length === 0) {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={styles.emptyText}>—</Text>
      </View>
    );
  }

  let angle = -Math.PI / 2;
  const arcs = segments
    .filter((segment) => segment.value > 0)
    .map((segment, index) => {
      const sweep = (segment.value / total) * Math.PI * 2;
      const start = angle;
      const end = angle + sweep;
      angle = end;
      const largeArc = sweep > Math.PI ? 1 : 0;
      const x1 = center + radius * Math.cos(start);
      const y1 = center + radius * Math.sin(start);
      const x2 = center + radius * Math.cos(end);
      const y2 = center + radius * Math.sin(end);
      return {
        key: `${segment.label}-${index}`,
        color: segment.color ?? palette.chart[index % palette.chart.length],
        d: `M${x1.toFixed(2)},${y1.toFixed(2)} A${radius},${radius} 0 ${largeArc} 1 ${x2.toFixed(2)},${y2.toFixed(2)}`,
      };
    });

  return (
    <View style={styles.donutWrap}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <Circle cx={center} cy={center} r={radius} stroke={palette.surfaceSunken} strokeWidth={thickness} fill="none" />
          <G>
            {arcs.map((arc) => (
              <Path
                key={arc.key}
                d={arc.d}
                stroke={arc.color}
                strokeWidth={thickness}
                strokeLinecap="butt"
                fill="none"
              />
            ))}
          </G>
        </Svg>
        {centerValue ? (
          <View style={{ position: 'absolute', alignItems: 'center' }}>
            <Text style={{ color: palette.ink900, fontSize: 19, fontWeight: '800' }}>{centerValue}</Text>
            {centerLabel ? (
              <Text style={{ color: palette.ink500, fontSize: 11, fontWeight: '600', marginTop: 2 }}>{centerLabel}</Text>
            ) : null}
          </View>
        ) : null}
      </View>
      <View style={styles.donutLegend}>
        {segments.map((segment, index) => (
          <View key={`legend-${segment.label}-${index}`} style={styles.chartLegendItem}>
            <View
              style={[
                styles.chartLegendDot,
                { backgroundColor: segment.color ?? palette.chart[index % palette.chart.length] },
              ]}
            />
            <Text style={styles.chartLegendLabel} numberOfLines={1}>{segment.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Column chart — discrete comparison (weekly throughput, etc.).       */
/* ------------------------------------------------------------------ */

export function ColumnChart({
  data,
  height = 140,
  color,
}: {
  data: ReadonlyArray<{ label?: string; value: number }>;
  height?: number;
  color?: string;
}) {
  const { palette } = useAppTheme();
  const styles = useAppStyles();
  const values = data.map((entry) => entry.value);

  if (values.length === 0) {
    return (
      <View style={{ height, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={styles.emptyText}>—</Text>
      </View>
    );
  }

  const width = 320;
  const labelH = 18;
  const innerH = height - labelH;
  const max = Math.max(1, ...values);
  const slot = width / values.length;
  const barW = Math.max(6, Math.min(28, slot * 0.56));
  const fill = color ?? palette.brand600;

  return (
    <View>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        {[0.5].map((ratio) => (
          <Line
            key={ratio}
            x1={0}
            y1={innerH * ratio}
            x2={width}
            y2={innerH * ratio}
            stroke={palette.lineSoft}
            strokeWidth="1"
            strokeDasharray="3 4"
          />
        ))}
        {values.map((value, index) => {
          const barH = Math.max(2, (value / max) * (innerH - 12));
          const x = slot * index + (slot - barW) / 2;
          const y = innerH - barH;
          return (
            <Rect
              key={index}
              x={x}
              y={y}
              width={barW}
              height={barH}
              rx={Math.min(5, barW / 2)}
              fill={index === values.length - 1 ? fill : palette.brand300}
            />
          );
        })}
      </Svg>
      <View style={[styles.chartFooter, { marginTop: 2 }]}>
        {data.length > 0 ? (
          <Text style={styles.chartFooterLabel} numberOfLines={1}>{data[0].label ?? ''}</Text>
        ) : null}
        {data.length > 2 ? (
          <Text style={styles.chartFooterLabel} numberOfLines={1}>{data[Math.floor((data.length - 1) / 2)].label ?? ''}</Text>
        ) : null}
        {data.length > 1 ? (
          <Text style={styles.chartFooterLabel} numberOfLines={1}>{data[data.length - 1].label ?? ''}</Text>
        ) : null}
      </View>
    </View>
  );
}
