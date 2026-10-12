/**
 * WhatsApp delivery history — Payrio-style messaging activity. Shows
 * sent / delivered / read KPI cards on top and a list of message rows.
 */
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { useAppStyles } from '../theme/useAppStyles';
import { useAppTheme } from '../theme/palette';
import { ActionButton, EmptyState, IconDot, StatusPill } from '../theme/primitives';
import { useWorkspace } from '../hooks/useWorkspace';
import { interpolate } from '../i18n';

const STATUS_TONE: Record<string, 'mint' | 'amber' | 'red' | 'muted'> = {
  QUEUED: 'muted',
  PROCESSING: 'amber',
  SENT: 'amber',
  DELIVERED: 'mint',
  READ: 'mint',
  FAILED: 'red',
  NOT_SENT: 'red',
};

export function NotificationsScreen() {
  const styles = useAppStyles();
  const { palette } = useAppTheme();
  const ws = useWorkspace();
  const copy = ws.copy;

  useEffect(() => { void ws.refreshNotificationHistory(); }, [ws.refreshNotificationHistory]);

  const items = ws.notificationHistory;
  const counts = items.reduce(
    (acc, n) => {
      if (n.status === 'SENT' || n.status === 'DELIVERED' || n.status === 'READ') acc.sent += 1;
      if (n.status === 'DELIVERED' || n.status === 'READ') acc.delivered += 1;
      if (n.status === 'READ') acc.read += 1;
      if (n.status === 'FAILED' || n.status === 'NOT_SENT') acc.failed += 1;
      return acc;
    },
    { sent: 0, delivered: 0, read: 0, failed: 0 },
  );

  return (
    <>
      <View style={styles.pageHeadingRow}>
        <View>
          <Text style={styles.pageTitle}>{copy.notificationHistory}</Text>
          <Text style={styles.pageSubtitle}>{copy.sent} / {copy.delivered} / {copy.read}</Text>
        </View>
      </View>

      {/* Hero stat tiles */}
      <View style={styles.chipWrap}>
        {[
          { label: interpolate(copy.sentToday, String(counts.sent)), tone: 'mint' as const, key: 'sent' },
          { label: interpolate(copy.deliveredPill, String(counts.delivered)), tone: 'blue' as const, key: 'delivered' },
          { label: interpolate(copy.readPill, String(counts.read)), tone: 'violet' as const, key: 'read' },
          { label: copy.failed, tone: 'red' as const, key: 'failed' },
        ].map((tile) => (
          <View key={tile.key} style={styles.listCard}>
            <IconDot tone={tile.tone} name="notifications" />
            <View style={styles.listMain}>
              <Text style={styles.listPrice}>{tile.label.split(' ')[0]}</Text>
              <Text style={styles.listMeta}>{tile.label.split(' ').slice(1).join(' ') || tile.label}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Filter chips */}
      <View style={styles.chipWrap}>
        {[copy.paymentSegAll, 'Order updates', 'Payment receipts', 'Pickup ready', copy.failed].map((label, i) => (
          <View key={label} style={[styles.chip, i === 0 && styles.chipSelected]}>
            <Text style={[styles.chipText, i === 0 && styles.chipTextSelected]}>{label}</Text>
          </View>
        ))}
      </View>

      {/* Failed delivery alert */}
      {counts.failed > 0 ? (
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
          return (
            <View key={n.id} style={styles.listCard}>
              <View style={styles.activityIcon}>
                <Text style={styles.wpIconText}>W</Text>
              </View>
              <View style={styles.listMain}>
                <View style={styles.listRow}>
                  <Text style={styles.listTitle} numberOfLines={1}>
                    {n.kind.replaceAll('_', ' ').toLowerCase()}
                  </Text>
                  <StatusPill tone={STATUS_TONE[n.status] ?? 'muted'}>{statusLabel}</StatusPill>
                </View>
                <Text style={styles.listMeta}>{n.recipientPhone || '—'}</Text>
                {n.renderedMessage ? <Text style={styles.activityPreview} numberOfLines={2}>{n.renderedMessage}</Text> : null}
                <Text style={styles.listMeta}>{new Date(n.createdAt).toLocaleString()}</Text>
              </View>
              <Text style={styles.customerAction}>{copy.viewOnWhatsapp}</Text>
            </View>
          );
        })
      )}

      {ws.online === true ? (
        <ActionButton
          title={copy.retry}
          loading={ws.loadingNotifications}
          loadingTitle={copy.loading}
          onPress={() => void ws.refreshNotificationHistory()}
          secondary
        />
      ) : null}
    </>
  );
}
