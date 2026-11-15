import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadTheme,
  saveTheme,
  THEME_CYCLE_ORDER,
  THEME_STORAGE_KEY,
  THEMES,
  ThemeMode,
} from './theme';

describe('Aesthetic Theme Engine', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    (globalThis as any).localStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, val: string) => store.set(key, String(val)),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    };
  });

  it('defaults to sanrio pastel theme when no preference is saved', () => {
    expect(loadTheme()).toBe('sanrio');
  });

  it('correctly persists and loads all supported aesthetic themes', () => {
    const modes: ThemeMode[] = ['sanrio', 'kuromi', 'dark', 'light'];
    for (const mode of modes) {
      saveTheme(mode);
      expect(loadTheme()).toBe(mode);
    }
  });

  it('falls back to sanrio when invalid value is in localStorage', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'invalid-theme-xyz');
    expect(loadTheme()).toBe('sanrio');
  });

  it('includes complete metadata for all 4 distinct aesthetic themes', () => {
    expect(THEMES).toHaveLength(4);
    const ids = THEMES.map((t) => t.id);
    expect(ids).toContain('sanrio');
    expect(ids).toContain('kuromi');
    expect(ids).toContain('dark');
    expect(ids).toContain('light');

    for (const theme of THEMES) {
      expect(theme.label).toBeTruthy();
      expect(theme.icon).toBeTruthy();
      expect(theme.sublabel).toBeTruthy();
      expect(theme.swatchBg).toBeTruthy();
    }
  });

  it('cycles smoothly through the defined theme order', () => {
    expect(THEME_CYCLE_ORDER).toEqual(['sanrio', 'kuromi', 'dark', 'light']);
    let current: ThemeMode = 'sanrio';
    const nextIdx = (THEME_CYCLE_ORDER.indexOf(current) + 1) % THEME_CYCLE_ORDER.length;
    expect(THEME_CYCLE_ORDER[nextIdx]).toBe('kuromi');
  });
});

