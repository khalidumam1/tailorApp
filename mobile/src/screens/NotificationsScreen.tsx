/**
 * WhatsApp delivery history — clean list with KPI tiles, filter chips,
 * and per-message rows.
 */
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAppStyles } from '../theme/useAppStyles';
import { useAppTheme } from '../theme/palette';
import { ActionButton, EmptyState, IconDot, StatusPill, openExternal } from '../theme/primitives';
import { useWorkspace, type WhatsAppNotification } from '../hooks/useWorkspace';
import { whatsappUrl } from '../data/messaging';

const STATUS_TONE: Record<string, 'mint' | 'amber' | 'red' | 'muted'> = {
  QUEUED: 'muted',
  PROCESSING: 'amber',
  SENT: 'amber',
  DELIVERED: 'mint',
  READ: 'mint',
  FAILED: 'red',
  NOT_SENT: 'red',
};

type Filter = 'all' | 'orders' | 'payments' | 'ready' | 'failed';

const FILTER_KINDS: Record<Exclude<Filter, 'all' | 'failed'>, string[]> = {
  orders: ['ORDER_CREATED', 'STATUS_CHANGED'],
  payments: ['PAYMENT_RECEIVED'],
  ready: ['ORDER_READY'],
};

function matchesFilter(item: WhatsAppNotification, filter: Filter): boolean {
  if (filter === 'all') return true;
  if (filter === 'failed') return item.status === 'FAILED' || item.status === 'NOT_SENT';
  return FILTER_KINDS[filter].includes(item.kind);
}

export function NotificationsScreen() {
  const styles = useAppStyles();
  const { palette } = useAppTheme();
  const ws = useWorkspace();
  const copy = ws.copy;
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => { void ws.refreshNotificationHistory(); }, [ws.refreshNotificationHistory]);

  const allItems = ws.notificationHistory;
  const items = allItems.filter((n) => matchesFilter(n, filter));
  const counts = allItems.reduce(
    (acc, n) => {
      if (n.status === 'SENT' || n.status === 'DELIVERED' || n.status === 'READ') acc.sent += 1;
      if (n.status === 'DELIVERED' || n.status === 'READ') acc.delivered += 1;
      if (n.status === 'READ') acc.read += 1;
      if (n.status === 'FAILED' || n.status === 'NOT_SENT') acc.failed += 1;
      return acc;
    },
    { sent: 0, delivered: 0, read: 0, failed: 0 },
  );

  const filterChips: Array<{ key: Filter; label: string }> = [
    { key: 'all', label: copy.paymentSegAll },
    { key: 'orders', label: copy.orderUpdates },
    { key: 'payments', label: copy.paymentReceipts },
    { key: 'ready', label: copy.pickupReady },
    { key: 'failed', label: copy.failed },
  ];

  return (
    <>
      <View style={styles.pageHeadingRow}>
        <View>
          <Text style={styles.pageTitle}>{copy.notificationHistory}</Text>
          <Text style={styles.pageSubtitle}>{copy.sent} / {copy.delivered} / {copy.read}</Text>
        </View>
      </View>

      {/* KPI tiles */}
      <View style={styles.chipWrap}>
        {[
          { label: copy.sent, value: counts.sent, tone: 'mint' as const, key: 'sent' },
          { label: copy.delivered, value: counts.delivered, tone: 'blue' as const, key: 'delivered' },
          { label: copy.read, value: counts.read, tone: 'violet' as const, key: 'read' },
          { label: copy.failed, value: counts.failed, tone: 'red' as const, key: 'failed' },
        ].map((tile) => (
          <View key={tile.key} style={styles.listCard}>
            <IconDot tone={tile.tone} name="notifications" />
            <View style={styles.listMain}>
              <Text style={styles.listPrice}>{tile.value}</Text>
              <Text style={styles.listMeta}>{tile.label}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Filter chips */}
      <View style={styles.chipWrap}>
        {filterChips.map((chip) => {
          const active = filter === chip.key;
          return (
            <Pressable
              key={chip.key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              android_ripple={{ color: palette.primarySoft }}
              onPress={() => setFilter(chip.key)}
              style={({ pressed }) => [styles.chip, active && styles.chipSelected, pressed && styles.chipPressed]}
            >
              <Text style={[styles.chipText, active && styles.chipTextSelected]}>{chip.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {counts.failed > 0 && filter !== 'failed' ? (
        <View style={[styles.card, { borderLeftWidth: 4, borderLeftColor: palette.danger, marginBottom: 12 }]}>
          <Text style={styles.errorText}>{copy.failedDelivery}</Text>
          <Text style={styles.listMeta}>{copy.invalidNumber}</Text>
        </View>
      ) : null}

      {items.length === 0 ? (
        <EmptyState title={copy.emptyNotifications} />
      ) : (
        items.map((n) => {
          const statusLabel = {
            QUEUED: copy.queued,
            PROCESSING: copy.processing,
            SENT: copy.sent,
            DELIVERED: copy.delivered,
            READ: copy.read,
            FAILED: copy.failed,
            NOT_SENT: copy.notSent,
          }[n.status];
          const chatUrl = whatsappUrl(n.recipientPhone);
          return (
            <View key={n.id} style={styles.listCard}>
              <View style={styles.wpIcon}>
                <Text style={styles.wpIconText}>W</Text>
              </View>
              <View style={styles.listMain}>
                <View style={styles.listRow}>
                  <Text style={styles.listTitle} numberOfLines={1}>
                    {n.kind.replaceAll('_', ' ').toLowerCase()}
                  </Text>
                  <StatusPill tone={STATUS_TONE[n.status] ?? 'muted'}>{statusLabel}</StatusPill>
                </View>
                <Text style={styles.listMeta}>{n.recipientName ? `${n.recipientName} · ` : ''}{n.recipientPhone || '—'}</Text>
                {n.renderedMessage ? <Text style={styles.activityPreview} numberOfLines={2}>{n.renderedMessage}</Text> : null}
                {n.lastError ? <Text style={styles.errorText}>{n.lastError}</Text> : null}
                <Text style={styles.listMeta}>{new Date(n.createdAt).toLocaleString()}</Text>
                {chatUrl ? (
                  <Pressable
                    accessibilityRole="button"
                    android_ripple={{ color: palette.primarySoft }}
                    onPress={() => openExternal(chatUrl, copy)}
                    style={({ pressed }) => [styles.customerActions, pressed && styles.pressed]}
                  >
                    <Text style={styles.customerAction}>{copy.viewOnWhatsapp}</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          );
        })
      )}

      {true ? (
        <ActionButton
          title={copy.retry}
          loading={ws.loadingNotifications}
          loadingTitle={copy.loading}
          onPress={() => void ws.refreshNotificationHistory()}
          secondary
        />
      ) : (
        <Text style={styles.offlineHint}>{copy.notificationsOnline}</Text>
      )}
    </>
  );
}
