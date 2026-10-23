import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACCENT_PRESETS,
  accentColorFor,
  DEFAULT_INTERFACE_PREFERENCES,
  INTERFACE_PREFERENCES_STORAGE_KEY,
  loadInterfacePreferences,
} from './theme';

const values = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); },
  clear: () => values.clear(),
};

describe('interface preferences', () => {
  beforeEach(() => {
    values.clear();
    vi.stubGlobal('localStorage', localStorageMock);
  });

  it('uses independent defaults when no preference is stored', () => {
    const first = loadInterfacePreferences();
    const second = loadInterfacePreferences();
    expect(first).toEqual(DEFAULT_INTERFACE_PREFERENCES);
    expect(first).not.toBe(second);
  });

  it('merges valid stored choices with defaults', () => {
    values.set(INTERFACE_PREFERENCES_STORAGE_KEY, JSON.stringify({ accent: 'blue', radius: 'sm', sidebarMode: 'icon' }));
    expect(loadInterfacePreferences()).toEqual({
      ...DEFAULT_INTERFACE_PREFERENCES,
      accent: 'blue',
      radius: 'sm',
      sidebarMode: 'icon',
    });
  });

  it('discards unknown or malformed values', () => {
    values.set(INTERFACE_PREFERENCES_STORAGE_KEY, JSON.stringify({ accent: 'neon', scale: 'giant', content: 'full' }));
    expect(loadInterfacePreferences()).toEqual({ ...DEFAULT_INTERFACE_PREFERENCES, content: 'full' });
    values.set(INTERFACE_PREFERENCES_STORAGE_KEY, '{not-json');
    expect(loadInterfacePreferences()).toEqual(DEFAULT_INTERFACE_PREFERENCES);
  });

  it('resolves preset colors and preserves the configured business brand', () => {
    const blue = ACCENT_PRESETS.find((preset) => preset.key === 'blue')?.color;
    expect(accentColorFor({ ...DEFAULT_INTERFACE_PREFERENCES, accent: 'blue' }, '#117a5c')).toBe(blue);
    expect(accentColorFor({ ...DEFAULT_INTERFACE_PREFERENCES, accent: 'brand' }, '#117a5c')).toBe('#117a5c');
  });

  it('falls back safely when browser storage is unavailable', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); } });
    expect(loadInterfacePreferences()).toEqual(DEFAULT_INTERFACE_PREFERENCES);
  });
});
