import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, isLoopbackEndpoint, parseSettings } from '../../src/core/settings';

describe('持久化设置', () => {
  it('损坏设置回到安全默认值且不包含授权状态', () => {
    expect(parseSettings({ settingsVersion: 99, aiAuthorized: true })).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings({ ...DEFAULT_SETTINGS, limits: { maxIntensity: 5, maxDurationMs: 99999 } }).limits)
      .toEqual({ maxIntensity: 0.7, maxDurationMs: 10_000 });
    expect(parseSettings({ ...DEFAULT_SETTINGS, unknown: true })).toEqual(DEFAULT_SETTINGS);
  });

  it('识别本机地址', () => {
    expect(isLoopbackEndpoint('ws://127.0.0.1:12345')).toBe(true);
    expect(isLoopbackEndpoint('wss://[::1]:12345')).toBe(true);
    expect(isLoopbackEndpoint('wss://example.test')).toBe(false);
  });
});
