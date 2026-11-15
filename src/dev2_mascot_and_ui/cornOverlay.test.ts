import { describe, expect, it } from 'vitest';

export function shouldDisplayCornOverlay(alwaysShow: boolean, hovered: boolean, hasBanner: boolean, hasPet = true): boolean {
  if (!hasPet || hasBanner) return false;
  return alwaysShow || hovered;
}

export function parseAlwaysShowCornSetting(storedValue: string | null): boolean {
  return storedValue === 'true';
}

describe('Corn Overlay Display Logic', () => {
  it('defaults to false when no setting is saved in localStorage', () => {
    expect(parseAlwaysShowCornSetting(null)).toBe(false);
    expect(parseAlwaysShowCornSetting(undefined as any)).toBe(false);
    expect(parseAlwaysShowCornSetting('')).toBe(false);
  });

  it('correctly parses explicit true and false stored values', () => {
    expect(parseAlwaysShowCornSetting('false')).toBe(false);
    expect(parseAlwaysShowCornSetting('true')).toBe(true);
  });

  it('keeps corn card visible when alwaysShow is enabled even when not hovering', () => {
    expect(shouldDisplayCornOverlay(true, false, false)).toBe(true);
    expect(shouldDisplayCornOverlay(true, true, false)).toBe(true);
  });

  it('hides corn card when alwaysShow is disabled and cursor is not hovering', () => {
    expect(shouldDisplayCornOverlay(false, false, false)).toBe(false);
    expect(shouldDisplayCornOverlay(false, true, false)).toBe(true);
  });

  it('hides corn card when a level up or hatch banner is actively playing', () => {
    expect(shouldDisplayCornOverlay(true, true, true)).toBe(false);
    expect(shouldDisplayCornOverlay(true, false, true)).toBe(false);
  });
});
