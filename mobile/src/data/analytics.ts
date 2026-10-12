/**
 * Analytics derived from the local order list. The mobile app keeps orders in
 * WatermelonDB so everything here is a pure derivation of `LocalOrder[]`.
 * No additional network calls are required for the analytics screen.
 */
import type { LocalOrder } from '../local';

export type OrderValuePoint = { label: string; value: number };

export type StageBreakdownRow = { stageKey: string; stageLabel: string; count: number; share: number; color: string };

export type TopItemRow = { itemName: string; count: number };

export type DashboardSummary = {
  newOrders: number;
  inProgress: number;
  dueToday: number;
  overdue: number;
  totalActive: number;
  totalCollected: number;
  totalOutstanding: number;
  weeklyOrderValue: OrderValuePoint[];
  pipelineBreakdown: StageBreakdownRow[];
  topItems: TopItemRow[];
  trendPercent: number;
};

const STAGE_COLORS = ['#7ad6a3', '#88b9e4', '#f0c073', '#a995e0', '#f19386', '#5db1e3', '#c08a33'];

function startOfWeek(d: Date): Date {
  const day = d.getDay();
  // Week starts on Monday in this region.
  const diff = (day === 0 ? -6 : 1 - day);
  const result = new Date(d.getTime());
  result.setDate(result.getDate() + diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

function parseDate(value: string): Date {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function formatShortDate(d: Date): string {
  return `${d.getDate()} ${d.toLocaleString('en-PK', { month: 'short' })}`;
}

function sumOrderTotal(orders: LocalOrder[]): number {
  return orders.reduce((sum, o) => sum + Number(o.total || 0), 0);
}

export function computeDashboardSummary(orders: LocalOrder[], stageMap: Record<string, string>): DashboardSummary {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const initialStage = Object.entries(stageMap).find(([, label]) => label)?.at(0);
  const terminalStageKeys = new Set(Object.keys(stageMap).filter((k) => /COLLECTED|DELIVERED|COMPLETED|READY/i.test(k)));

  const activeOrders = orders.filter((o) => !terminalStageKeys.has(o.workflow_stage_key ?? o.status));
  const newOrders = orders.filter((o) => (o.workflow_stage_key ?? o.status) === initialStage).length;
  const inProgress = activeOrders.filter((o) => (o.workflow_stage_key ?? o.status) !== initialStage).length;
  const dueToday = activeOrders.filter((o) => isSameDay(parseDate(o.promised_at), today)).length;
  const overdue = activeOrders.filter((o) => parseDate(o.promised_at).getTime() < today.getTime()).length;

  // Weekly order value buckets: the last 8 weeks.
  const weekBuckets: OrderValuePoint[] = [];
  const startOfThisWeek = startOfWeek(today);
  for (let i = 7; i >= 0; i--) {
    const weekStart = new Date(startOfThisWeek.getTime());
    weekStart.setDate(weekStart.getDate() - i * 7);
    const weekEnd = new Date(weekStart.getTime());
    weekEnd.setDate(weekEnd.getDate() + 7);
    const value = orders
      .filter((o) => {
        const created = parseDate((o as any).createdAt ?? o.promised_at);
        return created >= weekStart && created < weekEnd;
      })
      .reduce((sum, o) => sum + Number(o.total || 0), 0);
    weekBuckets.push({ label: formatShortDate(weekStart), value });
  }
  // Trend: compare last week to the one before.
  const thisWeek = weekBuckets.at(-1)?.value ?? 0;
  const prevWeek = weekBuckets.at(-2)?.value ?? 0;
  const trendPercent = prevWeek > 0 ? Math.round(((thisWeek - prevWeek) / prevWeek) * 100) : thisWeek > 0 ? 100 : 0;

  // Pipeline breakdown: count orders per stage (active only).
  const stageCounts = new Map<string, number>();
  for (const order of activeOrders) {
    const key = order.workflow_stage_key ?? order.status;
    if (!key) continue;
    stageCounts.set(key, (stageCounts.get(key) ?? 0) + 1);
  }
  const sortedStages = [...stageCounts.entries()].sort((a, b) => b[1] - a[1]);
  const totalActiveForBreakdown = Math.max(1, activeOrders.length);
  const pipelineBreakdown: StageBreakdownRow[] = sortedStages.map(([key, count], index) => ({
    stageKey: key,
    stageLabel: stageMap[key] ?? key.replaceAll('_', ' '),
    count,
    share: count / totalActiveForBreakdown,
    color: STAGE_COLORS[index % STAGE_COLORS.length],
  }));

  // Top items by name across recent orders.
  const itemCounts = new Map<string, number>();
  for (const order of activeOrders) {
    const name = (order.item_name ?? order.garment_name ?? '').trim() || '—';
    itemCounts.set(name, (itemCounts.get(name) ?? 0) + Number(order.quantity || 1));
  }
  const topItems: TopItemRow[] = [...itemCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([itemName, count]) => ({ itemName, count }));

  return {
    newOrders,
    inProgress,
    dueToday,
    overdue,
    totalActive: activeOrders.length,
    totalCollected: sumOrderTotal(orders.filter((o) => (o as any).paid === true)) || 0,
    totalOutstanding: sumOrderTotal(activeOrders),
    weeklyOrderValue: weekBuckets,
    pipelineBreakdown,
    topItems,
    trendPercent,
  };
}
