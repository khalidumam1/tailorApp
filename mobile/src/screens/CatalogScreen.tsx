/**
 * Catalog — clean list of items the shop sells or makes.
 * Owners and managers can add entries with configured custom fields.
 */
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { formatCurrency } from '../local';
import { useAppStyles } from '../theme/useAppStyles';
import { useAppTheme } from '../theme/palette';
import { ActionButton, EmptyState, Field } from '../theme/primitives';
import { useWorkspace } from '../hooks/useWorkspace';
import { DynamicField, StoredCustomFields } from '../components/DynamicFields';
import { interpolate } from '../i18n';

export function CatalogScreen() {
  const styles = useAppStyles();
  const { palette } = useAppTheme();
  const ws = useWorkspace();
  const copy = ws.copy;
  const [query, setQuery] = useState('');
  const canManage = ws.can('settings:manage');
  const currency = ws.businessConfiguration?.business.currency;
  const itemTypes = ws.businessConfiguration?.itemTypes ?? [];
  const typeLabel = (key: string) => itemTypes.find((type) => type.key === key)?.label ?? key;

  const items = ws.catalogItems.filter((item) =>
    !query.trim() || `${item.name} ${item.sku ?? ''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));

  return (
    <>
      <View style={styles.pageHeadingRow}>
        <View>
          <Text style={styles.pageTitle}>{ws.term('items', copy.catalog)}</Text>
          <Text style={styles.pageSubtitle}>{interpolate(copy.totalCount, String(ws.catalogItems.length))}</Text>
        </View>
        {canManage ? (
          <ActionButton
            title={`＋ ${copy.addCatalogItem}`}
            secondary={ws.catalogForm}
            onPress={() => { ws.setError(''); ws.setCatalogForm(!ws.catalogForm); }}
          />
        ) : null}
      </View>

      <Field label={copy.search} value={query} onChangeText={setQuery} />

      {ws.catalogForm && canManage ? (
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>{copy.itemTypeLabel}</Text>
          <View style={styles.chipWrap}>
            {itemTypes.map((itemType) => {
              const active = ws.selectedCatalogTypeKey === itemType.key;
              return (
                <Pressable
                  key={itemType.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  android_ripple={{ color: palette.primarySoft }}
                  onPress={() => { ws.setCatalogTypeKey(itemType.key); ws.setCatalogCustomFields({}); }}
                  style={({ pressed }) => [styles.chip, active && styles.chipSelected, pressed && styles.chipPressed]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextSelected]}>{itemType.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Field label={copy.nameLabel} value={ws.catalogName} onChangeText={ws.setCatalogName} />
          <Field label={copy.descriptionLabel} value={ws.catalogDescription} onChangeText={ws.setCatalogDescription} multiline />
          <Field label={copy.skuLabel} value={ws.catalogSku} onChangeText={ws.setCatalogSku} />
          <View style={styles.twoFields}>
            <View style={styles.halfField}>
              <Field label={copy.unitLabel} value={ws.catalogUnit} onChangeText={ws.setCatalogUnit} />
            </View>
            <View style={styles.halfField}>
              <Field label={`${copy.unitPriceLabel} (${currency ?? 'PKR'})`} value={ws.catalogUnitPrice} onChangeText={ws.setCatalogUnitPrice} keyboardType="decimal-pad" />
            </View>
          </View>
          {ws.visibleCatalogFields.map((field) => (
            <DynamicField key={field.id} field={field} values={ws.catalogCustomFields} setValues={ws.setCatalogCustomFields} />
          ))}
          <Text style={styles.offlineHint}>{copy.catalogSyncHint}</Text>
          <ActionButton
            title={copy.save}
            loading={ws.saving}
            loadingTitle={copy.loading}
            onPress={() => void ws.saveCatalogItem()}
            disabled={ws.saving || !ws.catalogName.trim()}
          />
          <View style={{ marginTop: 8 }}>
            <ActionButton title={copy.cancel} onPress={() => ws.setCatalogForm(false)} secondary disabled={ws.saving} />
          </View>
        </View>
      ) : null}

      {items.length === 0 ? (
        <EmptyState title={copy.emptyCatalog} />
      ) : items.map((item) => {
        const busy = ws.togglingCatalogId === item.id;
        const canToggle = canManage;
        return (
          <View key={item.id} style={[styles.listCard, !item.active && styles.disabled]}>
            <View style={styles.listMain}>
              <Text style={styles.listTitle}>{item.name}</Text>
              {item.description ? <Text style={styles.listMeta}>{item.description}</Text> : null}
              <Text style={styles.listMeta}>
                {typeLabel(item.typeKey)}{item.sku ? ` · ${item.sku}` : ''} · {item.unit}
              </Text>
              {item.unitPrice ? <Text style={styles.listMeta}>{formatCurrency(item.unitPrice, currency)} / {item.unit}</Text> : null}
              <StoredCustomFields serialized={JSON.stringify(item.customFields)} definitions={ws.catalogFields} errorLabel={copy.error} />
            </View>
            {canToggle ? (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: ws.saving || busy, busy }}
                android_ripple={{ color: palette.primarySoft }}
                disabled={ws.saving || busy}
                onPress={() => void ws.toggleCatalogItem(item)}
                style={({ pressed }) => [styles.chip, (ws.saving || busy) && styles.disabled, pressed && styles.chipPressed]}
              >
                <View style={styles.actionButtonContent}>
                  {busy ? <ActivityIndicator size="small" color={palette.primaryText} /> : null}
                  <Text style={styles.chipText}>{item.active ? copy.deactivate : copy.activate}</Text>
                </View>
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </>
  );
}
