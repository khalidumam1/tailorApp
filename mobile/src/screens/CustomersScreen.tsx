/**
 * Customers screen — Payrio-style dense customer cards with stats row and
 * consent / WhatsApp / call actions. Also has a search field and an
 * "Add customer" expansion.
 */
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useAppStyles } from '../theme/useAppStyles';
import { useAppTheme } from '../theme/palette';
import { Icon, type IconName } from '../Icons';
import { ActionButton, EmptyState, Field, IconDot, StatusPill } from '../theme/primitives';
import { useWorkspace } from '../hooks/useWorkspace';
import { formatCurrency } from '../local';

export function CustomersScreen() {
  const styles = useAppStyles();
  const { palette } = useAppTheme();
  const ws = useWorkspace();
  const copy = ws.copy;

  const filtered = ws.customers.filter((c) => {
    const q = ws.search.trim().toLocaleLowerCase();
    return !q || c.name.toLocaleLowerCase().includes(q) || c.phone.includes(q);
  });

  // Per-customer stats: derived from local orders
  const ordersByCustomer = new Map<string, { count: number; spent: number; lastVisitAt: number }>();
  for (const order of ws.orders) {
    const existing = ordersByCustomer.get(order.customer_id) ?? { count: 0, spent: 0, lastVisitAt: 0 };
    existing.count += 1;
    existing.spent += Number(order.total || 0);
    const promised = new Date(order.promised_at).getTime();
    if (promised > existing.lastVisitAt) existing.lastVisitAt = promised;
    ordersByCustomer.set(order.customer_id, existing);
  }

  return (
    <>
      <View style={styles.pageHeadingRow}>
        <View>
          <Text style={styles.pageTitle}>{ws.term('customers', copy.customers)}</Text>
          <Text style={styles.pageSubtitle}>{ws.customers.length} {ws.term('customers', copy.customers).toLowerCase()}</Text>
        </View>
        {ws.can('customers:write') ? (
          <ActionButton title={`＋ ${copy.addCustomer}`} onPress={() => { ws.setError(''); ws.setCustomerForm(!ws.customerForm); }} />
        ) : null}
      </View>
      <Field label={copy.search} value={ws.search} onChangeText={ws.setSearch} />
      {ws.customerForm ? (
        <View style={styles.card}>
          <Field label={copy.customerName} value={ws.customerName} onChangeText={ws.setCustomerName} />
          <Field label={copy.phone} value={ws.customerPhone} onChangeText={ws.setCustomerPhone} keyboardType="phone-pad" />
          <Field label={copy.notes} value={ws.customerNotes} onChangeText={ws.setCustomerNotes} multiline />
          <Text style={styles.offlineHint}>{copy.saved}</Text>
          <ActionButton title={copy.save} loading={ws.saving} loadingTitle={copy.loading} onPress={() => void ws.saveCustomer()} disabled={ws.saving} />
        </View>
      ) : null}
      {filtered.length ? (
        <ScrollView horizontal={false} showsVerticalScrollIndicator={false}>
          {filtered.map((customer) => {
            const stats = ordersByCustomer.get(customer.id) ?? { count: 0, spent: 0, lastVisitAt: 0 };
            return (
              <View key={customer.id} style={[styles.listCard, styles.cardAccentPrimary]}>
                <View style={styles.avatarLg}>
                  <Text style={styles.avatarTextLg}>{customer.name.slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={styles.listMain}>
                  <View style={styles.listRow}>
                    <Text style={styles.listTitle} numberOfLines={1}>{customer.name}</Text>
                    <View style={[styles.whatsappDot]} />
                  </View>
                  <Text style={styles.listMeta}>{customer.phone}</Text>
                  {stats.count > 0 ? (
                    <View style={styles.customerStats}>
                      <View style={styles.customerStatPill}>
                        <Text style={styles.customerStatText}>{stats.count} {ws.term('orders', copy.orders).toLowerCase()}</Text>
                      </View>
                      <View style={styles.customerStatPill}>
                        <Text style={styles.customerStatText}>{formatCurrency(stats.spent.toFixed(2), ws.businessConfiguration?.business.currency)}</Text>
                      </View>
                      <View style={styles.customerStatPill}>
                        <Text style={styles.customerStatText}>
                          {stats.lastVisitAt ? new Date(stats.lastVisitAt).toLocaleDateString() : '—'}
                        </Text>
                      </View>
                    </View>
                  ) : null}
                  <View style={styles.customerActions}>
                    <Text style={styles.customerAction}>{copy.customerOpen}</Text>
                    <Text style={styles.customerAction}>{copy.customerWhatsapp}</Text>
                    <Text style={styles.customerAction}>{copy.customerCall}</Text>
                  </View>
                </View>
                <Text style={styles.syncBadge}>{customer.sync_state === 'synced' ? '✓' : '↑'}</Text>
              </View>
            );
          })}
        </ScrollView>
      ) : (
        <EmptyState title={copy.emptyCustomers} />
      )}
    </>
  );
}
