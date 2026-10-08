/**
 * Lightweight SVG chart primitives.
 *
 * The product deliberately ships no charting dependency: every visual here is
 * computed inline from plain numbers, which keeps the bundle small and makes the
 * charts theme-aware through `currentColor` and CSS variables.
 */

export type SparkPoint = { label: string; value: number };

const PALETTE = ['#4f46e5', '#0891b2', '#059669', '#d97706', '#7c3aed', '#db2777'];

export function paletteColor(index: number): string {
  return PALETTE[index % PALETTE.length];
}

function smoothPath(points: Array<{ x: number; y: number }>, tension = 0.28): string {
  if (points.length === 0) return '';
  if (points.length < 3) return points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`).join(' ');
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
    path += ` C${control1x},${control1y} ${control2x},${control2y} ${next.x},${next.y}`;
  }
  return path;
}

/** Compact inline trend line used inside KPI cards. */
export function Sparkline({ points, color = '#4f46e5', height = 34 }: { points: number[]; color?: string; height?: number }) {
  if (points.length < 2) return null;
  const width = 100;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  const coordinates = points.map((value, index) => ({
    x: (index / (points.length - 1)) * width,
    y: height - ((value - min) / span) * (height - 6) - 3,
  }));
  const line = smoothPath(coordinates);
  const area = `${line} L${width},${height} L0,${height} Z`;
  const gradientId = `spark-${color.replace('#', '')}-${points.length}-${Math.round(max)}`;
  return (
    <svg className="metric-spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="presentation" focusable="false">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Area chart with a soft gradient fill, grid lines and x-axis labels. */
export function AreaChart({
  data,
  height = 220,
  color = '#4f46e5',
  format = (value: number) => String(Math.round(value)),
}: {
  data: SparkPoint[];
  height?: number;
  color?: string;
  format?: (value: number) => string;
}) {
  if (data.length === 0) return null;
  const width = 640;
  const padding = { top: 16, right: 8, bottom: 26, left: 8 };
  const max = Math.max(...data.map((point) => point.value), 1);
  const innerHeight = height - padding.top - padding.bottom;
  const innerWidth = width - padding.left - padding.right;
  const step = data.length > 1 ? innerWidth / (data.length - 1) : 0;
  const coordinates = data.map((point, index) => ({
    x: padding.left + index * step,
    y: padding.top + innerHeight - (point.value / max) * innerHeight,
  }));
  const line = smoothPath(coordinates);
  const area = `${line} L${coordinates[coordinates.length - 1].x},${height - padding.bottom} L${padding.left},${height - padding.bottom} Z`;
  const gradientId = `area-${color.replace('#', '')}`;
  return (
    <svg className="chart-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Trend chart" focusable="false">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.26" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
        <line
          key={ratio}
          className="chart-grid-line"
          x1={padding.left}
          x2={width - padding.right}
          y1={padding.top + innerHeight * ratio}
          y2={padding.top + innerHeight * ratio}
        />
      ))}
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      {coordinates.map((point, index) => (
        <circle key={data[index].label} cx={point.x} cy={point.y} r="3" fill="var(--surface)" stroke={color} strokeWidth="2" />
      ))}
      {data.map((point, index) => (
        <text
          key={`label-${point.label}`}
          className="chart-axis-label"
          x={coordinates[index].x}
          y={height - 8}
          textAnchor={index === 0 ? 'start' : index === data.length - 1 ? 'end' : 'middle'}
        >
          {point.label}
        </text>
      ))}
      <title>{data.map((point) => `${point.label}: ${format(point.value)}`).join(' · ')}</title>
    </svg>
  );
}

/** Horizontal bar chart for ranked breakdowns (plan mix, top garments…). */
export function BarList({
  items,
  format = (value: number) => String(Math.round(value)),
}: {
  items: Array<{ label: string; value: number; color?: string; note?: string }>;
  format?: (value: number) => string;
}) {
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <div className="stack-sm">
      {items.map((item, index) => (
        <div className="progress-row" key={item.label}>
          <div className="progress-meta">
            <span>{item.label}</span>
            <strong>{format(item.value)}{item.note ? ` · ${item.note}` : ''}</strong>
          </div>
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{ width: `${Math.max(2, (item.value / max) * 100)}%`, background: item.color ?? paletteColor(index) }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Donut chart with a centre caption and a legend beside it. */
export function DonutChart({
  segments,
  size = 168,
  thickness = 20,
  centreValue,
  centreLabel,
}: {
  segments: Array<{ label: string; value: number; color?: string }>;
  size?: number;
  thickness?: number;
  centreValue?: string;
  centreLabel?: string;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="donut-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Distribution chart" focusable="false">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--line-soft)" strokeWidth={thickness} />
          {total > 0 && segments.map((segment, index) => {
            const fraction = segment.value / total;
            const dash = fraction * circumference;
            const element = (
              <circle
                key={segment.label}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={segment.color ?? paletteColor(index)}
                strokeWidth={thickness}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
              />
            );
            offset += dash;
            return element;
          })}
        </g>
        {centreValue && (
          <text x="50%" y="47%" textAnchor="middle" className="chart-tooltip" style={{ fontSize: 16 }}>{centreValue}</text>
        )}
        {centreLabel && (
          <text x="50%" y="60%" textAnchor="middle" className="chart-axis-label">{centreLabel}</text>
        )}
      </svg>
      <div className="chart-legend">
        {segments.map((segment, index) => (
          <span className="chart-legend-item" key={segment.label}>
            <span className="chart-legend-dot" style={{ background: segment.color ?? paletteColor(index) }} />
            {segment.label}
            <span className="chart-legend-value">
              {total > 0 ? `${Math.round((segment.value / total) * 100)}%` : '0%'}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Vertical column chart — used for weekly/monthly comparisons. */
export function ColumnChart({
  data,
  height = 200,
  color = '#4f46e5',
}: {
  data: SparkPoint[];
  height?: number;
  color?: string;
}) {
  if (data.length === 0) return null;
  const width = 640;
  const padding = { top: 12, right: 8, bottom: 26, left: 8 };
  const max = Math.max(...data.map((point) => point.value), 1);
  const innerHeight = height - padding.top - padding.bottom;
  const innerWidth = width - padding.left - padding.right;
  const slot = innerWidth / data.length;
  const barWidth = Math.min(46, slot * 0.56);
  return (
    <svg className="chart-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Column chart" focusable="false">
      {[0, 0.5, 1].map((ratio) => (
        <line key={ratio} className="chart-grid-line" x1={padding.left} x2={width - padding.right} y1={padding.top + innerHeight * ratio} y2={padding.top + innerHeight * ratio} />
      ))}
      {data.map((point, index) => {
        const barHeight = (point.value / max) * innerHeight;
        const x = padding.left + index * slot + (slot - barWidth) / 2;
        return (
          <rect
            key={point.label}
            x={x}
            y={padding.top + innerHeight - barHeight}
            width={barWidth}
            height={Math.max(2, barHeight)}
            rx="5"
            fill={color}
            opacity={0.85}
          />
        );
      })}
      {data.map((point, index) => (
        <text key={`label-${point.label}`} className="chart-axis-label" x={padding.left + index * slot + slot / 2} y={height - 8} textAnchor="middle">
          {point.label}
        </text>
      ))}
    </svg>
  );
}

/** Retention-style heat grid (platform cohort / plan coverage tables). */
export function HeatCell({ value, max }: { value: number; max: number }) {
  if (value <= 0) return <td className="heatmap-cell heatmap-cell-empty">—</td>;
  const intensity = Math.min(1, value / (max || 1));
  const alpha = 0.08 + intensity * 0.5;
  return (
    <td className="heatmap-cell" style={{ background: `color-mix(in srgb, var(--configured-primary) ${Math.round(alpha * 100)}%, transparent)` }}>
      {value}
    </td>
  );
}
