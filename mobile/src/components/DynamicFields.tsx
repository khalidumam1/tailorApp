/**
 * Business-configured custom fields. The field definitions come from the
 * cached business configuration; these components render the input for each
 * configured field type and show stored values on cards.
 */
import { Pressable, Text, View } from 'react-native';
import type { BusinessConfiguration } from '../api';
import { useAppStyles } from '../theme/useAppStyles';
import { useAppTheme } from '../theme/palette';
import { Field } from '../theme/primitives';
import { mobileFieldOptions } from '../hooks/useWorkspace';

export type ConfiguredField = BusinessConfiguration['fields'][number];

export function DynamicField({
  field,
  values,
  setValues,
}: {
  field: ConfiguredField;
  values: Record<string, unknown>;
  setValues: (next: Record<string, unknown>) => void;
}) {
  const styles = useAppStyles();
  const { palette } = useAppTheme();
  const value = Object.hasOwn(values, field.key) ? values[field.key] : field.defaultValue;
  const updateValue = (next: unknown) => setValues({ ...values, [field.key]: next });
  const label = `${field.label}${field.required ? ' *' : ''}`;

  if (field.type === 'BOOLEAN') {
    return (
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <View style={styles.chipWrap}>
          {[true, false].map((option) => {
            const active = value === option;
            return (
              <Pressable
                key={String(option)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                android_ripple={{ color: palette.primarySoft }}
                onPress={() => updateValue(option)}
                style={({ pressed }) => [styles.chip, active && styles.chipSelected, pressed && styles.chipPressed]}
              >
                <Text style={[styles.chipText, active && styles.chipTextSelected]}>{option ? 'Yes' : 'No'}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  if (field.type === 'DROPDOWN' || field.type === 'MULTI_SELECT') {
    const selected = Array.isArray(value) ? value : [];
    return (
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <View style={styles.chipWrap}>
          {mobileFieldOptions(field).map((option) => {
            const active = field.type === 'DROPDOWN' ? value === option.key : selected.includes(option.key);
            return (
              <Pressable
                key={option.key}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                android_ripple={{ color: palette.primarySoft }}
                onPress={() => updateValue(field.type === 'DROPDOWN'
                  ? (active ? undefined : option.key)
                  : active ? selected.filter((item) => item !== option.key) : [...selected, option.key])}
                style={({ pressed }) => [styles.chip, active && styles.chipSelected, pressed && styles.chipPressed]}
              >
                <Text style={[styles.chipText, active && styles.chipTextSelected]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <Field
      label={label}
      value={value === undefined || value === null ? '' : String(value)}
      onChangeText={(text) => updateValue(text)}
      keyboardType={['NUMBER', 'CURRENCY', 'MEASUREMENT'].includes(field.type) ? 'decimal-pad' : 'default'}
      multiline={['LONG_TEXT', 'NOTES'].includes(field.type)}
      placeholder={field.type === 'DATE' ? 'YYYY-MM-DD' : field.type === 'DATETIME' ? 'YYYY-MM-DD HH:mm' : field.label}
    />
  );
}

/** Shows values stored on a record (customer, order, catalog item) as labelled lines. */
export function StoredCustomFields({
  serialized,
  definitions,
  errorLabel,
}: {
  serialized: string | null | undefined;
  definitions: ConfiguredField[];
  errorLabel: string;
}) {
  const styles = useAppStyles();
  if (!serialized) return null;
  let entries: Array<[string, unknown]>;
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return <Text style={styles.listMeta}>{errorLabel}</Text>;
    }
    entries = Object.entries(parsed);
  } catch {
    return <Text style={styles.listMeta}>{errorLabel}</Text>;
  }
  if (entries.length === 0) return null;
  return (
    <>
      {entries.map(([key, value]) => (
        <Text key={key} style={styles.listMeta}>
          {definitions.find((field) => field.key === key)?.label ?? key}: {typeof value === 'string' ? value : JSON.stringify(value)}
        </Text>
      ))}
    </>
  );
}
