import { Prisma } from '@prisma/client';
import { HttpError } from '../errors.js';

type FieldDefinition = {
  id: string;
  key: string;
  label: string;
  type: string;
  required: boolean;
  defaultValue: Prisma.JsonValue | null;
  validation: Prisma.JsonValue | null;
  options: Prisma.JsonValue | null;
  visibility: Prisma.JsonValue | null;
};

type FieldContext = {
  itemTypeKey?: string;
};

export type ValidatedFieldValue = {
  fieldDefinitionId: string;
  key: string;
  type: string;
  value: string | number | boolean | string[] | Date;
};

export function withBuiltInOrderItemFields(
  definitions: readonly Pick<FieldDefinition, 'key'>[],
  input: Record<string, unknown>,
  name: string,
  quantity: number,
): Record<string, unknown> {
  const keys = new Set(definitions.map((field) => field.key));
  return {
    ...input,
    ...(keys.has('item_name') ? { item_name: name } : {}),
    ...(keys.has('garment_name') ? { garment_name: name } : {}),
    ...(keys.has('quantity') ? { quantity } : {}),
  };
}

function record(value: Prisma.JsonValue | null): Record<string, Prisma.JsonValue | undefined> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function isVisible(field: FieldDefinition, context: FieldContext): boolean {
  const visibility = record(field.visibility);
  const itemTypes = visibility.itemTypes ?? visibility.garmentTypes;
  if (!Array.isArray(itemTypes) || itemTypes.length === 0) return true;
  if (!context.itemTypeKey) return false;
  return itemTypes.some((item) => typeof item === 'string' && item === context.itemTypeKey);
}

function fieldOptions(field: FieldDefinition): Set<string> {
  const options = field.options;
  if (!Array.isArray(options)) return new Set();
  return new Set(options.flatMap((option) => {
    if (typeof option === 'string') return [option];
    if (option && typeof option === 'object' && !Array.isArray(option)
      && 'key' in option && typeof option.key === 'string') return [option.key];
    return [];
  }));
}

function stringValue(field: FieldDefinition, value: unknown): string {
  if (typeof value !== 'string') {
    throw new HttpError(400, `Field "${field.label}" must be text`, 'INVALID_CUSTOM_FIELD_VALUE');
  }
  const validation = record(field.validation);
  const minLength = typeof validation.minLength === 'number' ? validation.minLength : 0;
  const maxLength = typeof validation.maxLength === 'number' ? validation.maxLength : undefined;
  if (value.length < minLength || (maxLength !== undefined && value.length > maxLength)) {
    throw new HttpError(400, `Field "${field.label}" has an invalid length`, 'INVALID_CUSTOM_FIELD_VALUE');
  }
  if (typeof validation.pattern === 'string') {
    let pattern: RegExp;
    try {
      pattern = new RegExp(validation.pattern);
    } catch {
      throw new HttpError(500, `Field "${field.label}" has invalid validation configuration`, 'INVALID_FIELD_CONFIGURATION');
    }
    if (!pattern.test(value)) {
      throw new HttpError(400, `Field "${field.label}" has an invalid format`, 'INVALID_CUSTOM_FIELD_VALUE');
    }
  }
  return value;
}

function numericValue(field: FieldDefinition, value: unknown): number {
  const raw = typeof value === 'number' ? String(value) : value;
  if (typeof raw !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(raw)) {
    throw new HttpError(400, `Field "${field.label}" must be a number`, 'INVALID_CUSTOM_FIELD_VALUE');
  }
  const number = Number(raw);
  if (!Number.isFinite(number)) {
    throw new HttpError(400, `Field "${field.label}" must be a finite number`, 'INVALID_CUSTOM_FIELD_VALUE');
  }
  const validation = record(field.validation);
  if ((typeof validation.min === 'number' && number < validation.min)
    || (typeof validation.max === 'number' && number > validation.max)) {
    throw new HttpError(400, `Field "${field.label}" is outside the allowed range`, 'INVALID_CUSTOM_FIELD_VALUE');
  }
  return number;
}

function parseValue(field: FieldDefinition, value: unknown): ValidatedFieldValue['value'] {
  switch (field.type) {
    case 'TEXT':
    case 'LONG_TEXT':
    case 'NOTES':
    case 'REFERENCE':
      return stringValue(field, value);
    case 'NUMBER':
    case 'CURRENCY':
    case 'MEASUREMENT':
      return numericValue(field, value);
    case 'DATE':
    case 'DATETIME': {
      if (typeof value !== 'string' || Number.isNaN(Date.parse(value))
        || (field.type === 'DATE' && !/^\d{4}-\d{2}-\d{2}$/.test(value))) {
        throw new HttpError(400, `Field "${field.label}" must be a valid ${field.type.toLowerCase()}`, 'INVALID_CUSTOM_FIELD_VALUE');
      }
      const date = new Date(value);
      if (field.type === 'DATE' && date.toISOString().slice(0, 10) !== value) {
        throw new HttpError(400, `Field "${field.label}" must be a valid date`, 'INVALID_CUSTOM_FIELD_VALUE');
      }
      return date;
    }
    case 'DROPDOWN': {
      if (typeof value !== 'string' || !fieldOptions(field).has(value)) {
        throw new HttpError(400, `Field "${field.label}" must match a configured option`, 'INVALID_CUSTOM_FIELD_VALUE');
      }
      return value;
    }
    case 'MULTI_SELECT': {
      const options = fieldOptions(field);
      if (!Array.isArray(value) || !value.every((item) => typeof item === 'string' && options.has(item))) {
        throw new HttpError(400, `Field "${field.label}" contains an invalid option`, 'INVALID_CUSTOM_FIELD_VALUE');
      }
      if (new Set(value).size !== value.length) {
        throw new HttpError(400, `Field "${field.label}" contains duplicate options`, 'INVALID_CUSTOM_FIELD_VALUE');
      }
      return value;
    }
    case 'BOOLEAN':
      if (typeof value !== 'boolean') {
        throw new HttpError(400, `Field "${field.label}" must be true or false`, 'INVALID_CUSTOM_FIELD_VALUE');
      }
      return value;
    default:
      throw new HttpError(500, `Field "${field.label}" has an unsupported type`, 'INVALID_FIELD_CONFIGURATION');
  }
}

export function validateCustomFieldValues(
  definitions: readonly FieldDefinition[],
  input: unknown,
  context: FieldContext = {},
): ValidatedFieldValue[] {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpError(400, 'Custom field values must be an object', 'INVALID_CUSTOM_FIELD_VALUES');
  }
  const values = input as Record<string, unknown>;
  const visibleDefinitions = definitions.filter((field) => isVisible(field, context));
  const byKey = new Map(visibleDefinitions.map((field) => [field.key, field]));
  const unknown = Object.keys(values).find((key) => !byKey.has(key));
  if (unknown) {
    throw new HttpError(400, `Custom field "${unknown}" is not available for this screen`, 'UNKNOWN_CUSTOM_FIELD');
  }

  return visibleDefinitions.flatMap((field) => {
    const supplied = Object.hasOwn(values, field.key) ? values[field.key] : field.defaultValue;
    if (supplied === undefined || supplied === null || supplied === '') {
      if (field.required) {
        throw new HttpError(400, `Field "${field.label}" is required`, 'REQUIRED_CUSTOM_FIELD');
      }
      return [];
    }
    return [{
      fieldDefinitionId: field.id,
      key: field.key,
      type: field.type,
      value: parseValue(field, supplied),
    }];
  });
}

export function customFieldValueData(value: ValidatedFieldValue): {
  fieldDefinitionId: string;
  valueText?: string;
  valueNumber?: Prisma.Decimal;
  valueBoolean?: boolean;
  valueDate?: Date;
  valueJson?: Prisma.InputJsonValue;
} {
  if (value.value instanceof Date) {
    return { fieldDefinitionId: value.fieldDefinitionId, valueDate: value.value };
  }
  if (typeof value.value === 'number') {
    return { fieldDefinitionId: value.fieldDefinitionId, valueNumber: new Prisma.Decimal(value.value.toString()) };
  }
  if (typeof value.value === 'boolean') {
    return { fieldDefinitionId: value.fieldDefinitionId, valueBoolean: value.value };
  }
  if (Array.isArray(value.value)) {
    return { fieldDefinitionId: value.fieldDefinitionId, valueJson: value.value };
  }
  return { fieldDefinitionId: value.fieldDefinitionId, valueText: value.value };
}
