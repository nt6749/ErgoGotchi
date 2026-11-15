import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { compareVersions, getAppVersion } = require('../../electron/updater.cjs');

describe('Auto-Updater semver comparison', () => {
  it('returns package.json version rather than electron binary version', () => {
    const version = getAppVersion();
    expect(version).toBe('1.0.2');
    expect(version.startsWith('33.')).toBe(false);
  });

  it('detects newer minor and patch releases', () => {
    expect(compareVersions('v1.0.2', 'v1.0.1')).toBe(1);
    expect(compareVersions('v1.1.0', 'v1.0.9')).toBe(1);
    expect(compareVersions('v2.0.0', 'v1.9.9')).toBe(1);
  });

  it('detects equal versions with or without v prefix', () => {
    expect(compareVersions('v1.0.1', '1.0.1')).toBe(0);
    expect(compareVersions('1.0.1', 'v1.0.1')).toBe(0);
    expect(compareVersions('v1.0.0', 'v1.0.0')).toBe(0);
  });

  it('detects older versions', () => {
    expect(compareVersions('v1.0.0', 'v1.0.1')).toBe(-1);
    expect(compareVersions('1.0.1', '1.0.2')).toBe(-1);
    expect(compareVersions('v0.9.5', 'v1.0.0')).toBe(-1);
  });
});
