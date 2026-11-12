import { describe, expect, it } from 'vitest';
import { canCallModuleApi, shouldLoadMeasurementProfiles } from './module-access';

describe('canCallModuleApi', () => {
  it('allows a module the business has switched on', () => {
    expect(canCallModuleApi(['orders', 'measurements'], 'measurements')).toBe(true);
  });

  it('refuses a module the business has switched off', () => {
    expect(canCallModuleApi(['orders'], 'measurements')).toBe(false);
  });

  it('waits for the configuration instead of guessing', () => {
    expect(canCallModuleApi(undefined, 'measurements')).toBe(false);
  });

  it('refuses every module when the business has none', () => {
    expect(canCallModuleApi([], 'measurements')).toBe(false);
  });
});

describe('shouldLoadMeasurementProfiles', () => {
  const base = {
    view: 'orders',
    customerId: 'customer-1',
    enabledModules: ['orders', 'measurements'],
    hasPermission: true,
  };

  it('loads the profiles for the order form', () => {
    expect(shouldLoadMeasurementProfiles(base)).toBe(true);
  });

  it('loads the profiles for the measurement book', () => {
    expect(shouldLoadMeasurementProfiles({ ...base, view: 'measurements' })).toBe(true);
  });

  it('never loads them when the measurement book is switched off', () => {
    expect(shouldLoadMeasurementProfiles({ ...base, enabledModules: ['orders'] })).toBe(false);
  });

  it('never loads them before the configuration is known', () => {
    expect(shouldLoadMeasurementProfiles({ ...base, enabledModules: undefined })).toBe(false);
  });

  it('never loads them without the permission', () => {
    expect(shouldLoadMeasurementProfiles({ ...base, hasPermission: false })).toBe(false);
  });

  it('never loads them without a customer', () => {
    expect(shouldLoadMeasurementProfiles({ ...base, customerId: '' })).toBe(false);
  });

  it('does not load them on other screens', () => {
    expect(shouldLoadMeasurementProfiles({ ...base, view: 'dashboard' })).toBe(false);
  });
});
