/**
 * Customers — clean, searchable list with add/edit customer forms,
 * per-customer order history, and WhatsApp / call actions.
 */
import { useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { formatCurrency } from '../local';
import { useAppStyles } from '../theme/useAppStyles';
import { useAppTheme } from '../theme/palette';
import { Icon } from '../Icons';
import { ActionButton, EmptyState, Field, openExternal } from '../theme/primitives';
import { useWorkspace } from '../hooks/useWorkspace';
import { DynamicField, StoredCustomFields } from '../components/DynamicFields';
import { telUrl, whatsappUrl } from '../data/messaging';

export function CustomersScreen() {
  const styles = useAppStyles();
  const { palette } = useAppTheme();
  const ws = useWorkspace();
  const copy = ws.copy;
  const [openId, setOpenId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const currency = ws.businessConfiguration?.business.currency;
  const customerLabel = ws.term('customers', copy.customers);

  const filtered = useMemo(() => {
    const q = ws.search.trim().toLocaleLowerCase();
    return ws.customers.filter((c) => !q || c.name.toLocaleLowerCase().includes(q) || c.phone.includes(q));
  }, [ws.customers, ws.search]);

  const statsByCustomer = useMemo(() => {
    const map = new Map<string, { count: number; spent: number; lastVisitAt: number }>();
    for (const order of ws.orders) {
      const existing = map.get(order.customer_id) ?? { count: 0, spent: 0, lastVisitAt: 0 };
      existing.count += 1;
      existing.spent += Number(order.total || 0);
      const promised = new Date(order.promised_at).getTime();
      if (promised > existing.lastVisitAt) existing.lastVisitAt = promised;
      map.set(order.customer_id, existing);
    }
    return map;
  }, [ws.orders]);

  const openWhatsApp = (phone: string) => {
    const url = whatsappUrl(phone);
    if (!url) { Alert.alert(customerLabel, copy.noPhoneNumber); return; }
    openExternal(url, copy);
  };

  const call = (phone: string) => {
    const url = telUrl(phone);
    if (!url) { Alert.alert(customerLabel, copy.noPhoneNumber); return; }
    openExternal(url, copy);
  };

  const editCustomer = (customer: typeof ws.customers[number]) => {
    ws.setCustomerName(customer.name);
    ws.setCustomerPhone(customer.phone);
    ws.setCustomerNotes(customer.notes ?? '');
    ws.setCustomerCustomFields(customer.custom_fields_json ? JSON.parse(customer.custom_fields_json) : {});
    setEditId(customer.id);
  };

  return (
    <>
      <View style={styles.pageHeadingRow}>
        <View>
          <Text style={styles.pageTitle}>{customerLabel}</Text>
          <Text style={styles.pageSubtitle}>{ws.customers.length} {customerLabel.toLowerCase()}</Text>
        </View>
        {ws.can('customers:write') ? (
          <ActionButton
            title={`＋ ${copy.addCustomer}`}
            secondary={ws.customerForm || editId !== null}
            onPress={() => { ws.setError(''); ws.setCustomerForm(!ws.customerForm); setEditId(null); }}
          />
        ) : null}
      </View>

      <Field label={copy.search} value={ws.search} onChangeText={ws.setSearch} />

      {ws.customerForm && editId === null && ws.can('customers:write') ? (
        <View style={styles.card}>
          <Field label={copy.customerName} value={ws.customerName} onChangeText={ws.setCustomerName} />
          <Field label={copy.phone} value={ws.customerPhone} onChangeText={ws.setCustomerPhone} keyboardType="phone-pad" />
          <Field label={copy.notes} value={ws.customerNotes} onChangeText={ws.setCustomerNotes} multiline />
          {ws.customerFields.map((field) => (
            <DynamicField key={field.id} field={field} values={ws.customerCustomFields} setValues={ws.setCustomerCustomFields} />
          ))}
          <Text style={styles.offlineHint}>{copy.saved}</Text>
          <ActionButton
            title={copy.save}
            loading={ws.saving}
            loadingTitle={copy.loading}
            onPress={() => void ws.saveCustomer()}
            disabled={ws.saving || !ws.customerName.trim()}
          />
          <View style={{ marginTop: 8 }}>
            <ActionButton title={copy.cancel} onPress={() => ws.setCustomerForm(false)} secondary disabled={ws.saving} />
          </View>
        </View>
      ) : null}

      {editId !== null && ws.can('customers:write') ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{copy.customerName}</Text>
          <Field label={copy.customerName} value={ws.customerName} onChangeText={ws.setCustomerName} />
          <Field label={copy.phone} value={ws.customerPhone} onChangeText={ws.setCustomerPhone} keyboardType="phone-pad" />
          <Field label={copy.notes} value={ws.customerNotes} onChangeText={ws.setCustomerNotes} multiline />
          {ws.customerFields.map((field) => (
            <DynamicField key={field.id} field={field} values={ws.customerCustomFields} setValues={ws.setCustomerCustomFields} />
          ))}
          <ActionButton
            title={copy.save}
            loading={ws.saving}
            loadingTitle={copy.loading}
            onPress={() => void ws.saveCustomer()}
            disabled={ws.saving || !ws.customerName.trim()}
          />
          <View style={{ marginTop: 8 }}>
            <ActionButton title={copy.cancel} onPress={() => { setEditId(null); ws.setCustomerForm(false); }} secondary disabled={ws.saving} />
          </View>
        </View>
      ) : null}

      {filtered.length ? filtered.map((customer) => {
        const stats = statsByCustomer.get(customer.id) ?? { count: 0, spent: 0, lastVisitAt: 0 };
        const expanded = openId === customer.id;
        const customerOrders = ws.orders.filter((order) => order.customer_id === customer.id);
        const hasPhone = Boolean(whatsappUrl(customer.phone));
        const isEditing = editId === customer.id;
        return (
          <View key={customer.id} style={[styles.listCard, styles.cardAccentPrimary, { flexDirection: 'column', alignItems: 'stretch' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={styles.avatarLg}>
                <Text style={styles.avatarTextLg}>{customer.name.slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={styles.listMain}>
                <View style={styles.listRow}>
                  <Text style={styles.listTitle} numberOfLines={1}>{customer.name}</Text>
                  {ws.can('customers:write') && (
                    <Pressable
                      accessibilityRole="button"
                      android_ripple={{ color: palette.primarySoft }}
                      onPress={() => editCustomer(customer)}
                      style={({ pressed }) => [pressed && styles.pressed]}
                    >
                      <Icon name="palette" size={18} color={palette.primaryText} />
                    </Pressable>
                  )}
                </View>
                <Text style={styles.listMeta}>{customer.phone}</Text>
                {stats.count > 0 ? (
                  <View style={styles.customerStats}>
                    <View style={styles.customerStatPill}>
                      <Text style={styles.customerStatText}>{stats.count} {ws.term('orders', copy.orders).toLowerCase()}</Text>
                    </View>
                    <View style={styles.customerStatPill}>
                      <Text style={styles.customerStatText}>{formatCurrency(stats.spent.toFixed(2), currency)}</Text>
                    </View>
                    <View style={styles.customerStatPill}>
                      <Text style={styles.customerStatText}>
                        {stats.lastVisitAt ? new Date(stats.lastVisitAt).toLocaleDateString() : '—'}
                      </Text>
                    </View>
                  </View>
                ) : null}
              </View>
            </View>

            {isEditing ? (
              <View style={{ marginTop: 12 }}>
                <Text style={styles.sectionTitle}>{copy.customerName}</Text>
                <Field label={copy.customerName} value={ws.customerName} onChangeText={ws.setCustomerName} />
                <Field label={copy.phone} value={ws.customerPhone} onChangeText={ws.setCustomerPhone} keyboardType="phone-pad" />
                <Field label={copy.notes} value={ws.customerNotes} onChangeText={ws.setCustomerNotes} multiline />
                {ws.customerFields.map((field) => (
                  <DynamicField key={field.id} field={field} values={ws.customerCustomFields} setValues={ws.setCustomerCustomFields} />
                ))}
                <ActionButton
                  title={copy.save}
                  loading={ws.saving}
                  loadingTitle={copy.loading}
                  onPress={() => void ws.saveCustomer()}
                  disabled={ws.saving || !ws.customerName.trim()}
                />
                <View style={{ marginTop: 8 }}>
                  <ActionButton title={copy.cancel} onPress={() => { setEditId(null); ws.setCustomerForm(false); }} secondary disabled={ws.saving} />
                </View>
              </View>
            ) : null}

            <StoredCustomFields serialized={customer.custom_fields_json} definitions={ws.customerFields} errorLabel={copy.error} />

            <View style={styles.customerActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                android_ripple={{ color: palette.primarySoft }}
                onPress={() => setOpenId(expanded ? null : customer.id)}
                style={({ pressed }) => [pressed && styles.pressed]}
              >
                <Text style={styles.customerAction}>{expanded ? copy.hideDiff : copy.customerOpen}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !hasPhone }}
                android_ripple={{ color: palette.primarySoft }}
                onPress={() => openWhatsApp(customer.phone)}
                style={({ pressed }) => [!hasPhone && styles.disabled, pressed && styles.pressed]}
              >
                <Text style={styles.customerAction}>{copy.customerWhatsapp}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !hasPhone }}
                android_ripple={{ color: palette.primarySoft }}
                onPress={() => call(customer.phone)}
                style={({ pressed }) => [!hasPhone && styles.disabled, pressed && styles.pressed]}
              >
                <Text style={styles.customerAction}>{copy.customerCall}</Text>
              </Pressable>
            </View>

            {expanded && !isEditing ? (
              <View style={{ marginTop: 10 }}>
                <Text style={styles.sectionTitle}>{copy.customerOrders}</Text>
                {customerOrders.length === 0 ? (
                  <Text style={styles.listMeta}>{copy.noCustomerOrders}</Text>
                ) : customerOrders.slice(0, 10).map((order) => (
                  <View key={order.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                    <Text style={[styles.listMeta, { flex: 1 }]} numberOfLines={1}>
                      {order.item_name ?? order.garment_name} · {order.promised_at.slice(0, 10)}
                    </Text>
                    <Text style={styles.listPrice}>{formatCurrency(order.total, currency)}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        );
      }) : (
        <EmptyState title={copy.emptyCustomers} />
      )}
    </>
  );
}
