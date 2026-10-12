/**
 * New-order form. Ported from the original mobile app and rendered inside the
 * Orders screen. Saves through the workspace `saveOrder` action, which writes
 * to the local outbox first and syncs when online.
 */
import { Pressable, Text, View } from 'react-native';
import { useAppStyles } from '../theme/useAppStyles';
import { useAppTheme } from '../theme/palette';
import { ActionButton, Field } from '../theme/primitives';
import { useWorkspace } from '../hooks/useWorkspace';
import { DynamicField } from './DynamicFields';

export function OrderForm({ onOpenCustomers }: { onOpenCustomers: () => void }) {
  const styles = useAppStyles();
  const { palette } = useAppTheme();
  const ws = useWorkspace();
  const copy = ws.copy;
  const currency = ws.businessConfiguration?.business.currency;
  const itemLabel = ws.term('item', ws.currentItemType?.label ?? copy.item);
  const savedItems = ws.catalogItems.filter((item) => item.active && item.typeKey === ws.currentItemType?.key);

  if (ws.customers.length === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.listTitle}>{copy.emptyCustomers}</Text>
        <Text style={styles.listMeta}>{copy.chooseCustomer}</Text>
        <View style={{ marginTop: 12 }}>
          <ActionButton title={ws.term('customers', copy.customers)} onPress={onOpenCustomers} secondary />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.fieldLabel}>{copy.chooseCustomer}</Text>
      <View style={styles.chipWrap}>
        {ws.customers.map((customer) => {
          const active = ws.selectedCustomer === customer.id;
          return (
            <Pressable
              key={customer.id}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              android_ripple={{ color: palette.primarySoft }}
              onPress={() => ws.setSelectedCustomer(customer.id)}
              style={({ pressed }) => [styles.chip, active && styles.chipSelected, pressed && styles.chipPressed]}
            >
              <Text style={[styles.chipText, active && styles.chipTextSelected]}>{customer.name}</Text>
            </Pressable>
          );
        })}
      </View>

      <Field label={itemLabel} value={ws.itemName} onChangeText={ws.setItemName} />

      {ws.businessConfiguration?.itemTypes.length ? (
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{ws.term('item', ws.currentItemType?.label ?? copy.item)} · {copy.itemTypeLabel}</Text>
          <View style={styles.chipWrap}>
            {ws.businessConfiguration.itemTypes.map((itemType) => {
              const active = ws.currentItemType?.key === itemType.key;
              return (
                <Pressable
                  key={itemType.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  android_ripple={{ color: palette.primarySoft }}
                  onPress={() => ws.setOrderItemTypeKey(itemType.key)}
                  style={({ pressed }) => [styles.chip, active && styles.chipSelected, pressed && styles.chipPressed]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextSelected]}>{itemType.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {savedItems.length ? (
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{copy.savedItems}</Text>
          <View style={styles.chipWrap}>
            {savedItems.map((item) => {
              const active = ws.itemName === item.name;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  android_ripple={{ color: palette.primarySoft }}
                  onPress={() => {
                    ws.setItemName(item.name);
                    if (item.unitPrice) ws.setUnitPrice(item.unitPrice);
                  }}
                  style={({ pressed }) => [styles.chip, active && styles.chipSelected, pressed && styles.chipPressed]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextSelected]}>{item.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {ws.orderItemFieldDefinitions
        .filter((field) => !['item_name', 'garment_name', 'quantity'].includes(field.key))
        .map((field) => (
          <DynamicField key={field.id} field={field} values={ws.orderItemCustomFields} setValues={ws.setOrderItemCustomFields} />
        ))}
      {ws.orderFields.map((field) => (
        <DynamicField key={field.id} field={field} values={ws.orderCustomFields} setValues={ws.setOrderCustomFields} />
      ))}

      <View style={styles.twoFields}>
        <View style={styles.halfField}>
          <Field label={copy.quantity} value={ws.quantity} onChangeText={ws.setQuantity} keyboardType="number-pad" />
        </View>
        <View style={styles.halfField}>
          <Field label={copy.unitPrice} value={ws.unitPrice} onChangeText={ws.setUnitPrice} keyboardType="decimal-pad" />
        </View>
      </View>
      <Field label={copy.dueDate} value={ws.dueDate} onChangeText={ws.setDueDate} placeholder="YYYY-MM-DD" />
      <Field label={copy.notes} value={ws.orderNotes} onChangeText={ws.setOrderNotes} multiline />
      <Text style={styles.offlineHint}>{copy.saved}</Text>
      <ActionButton
        title={copy.saveOrder}
        loading={ws.saving}
        loadingTitle={copy.loading}
        onPress={() => void ws.saveOrder()}
        disabled={ws.saving || !ws.selectedCustomer}
      />
      <View style={{ marginTop: 8 }}>
        <ActionButton title={copy.cancel} onPress={() => ws.setOrderForm(false)} secondary disabled={ws.saving} />
      </View>
    </View>
  );
}
