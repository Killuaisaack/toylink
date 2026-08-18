import { describe, expect, it } from 'vitest';
import { parseToolVibrateArgs, parseToyCommand } from '../../src/core/command-schema';
import { applySafetyLimits } from '../../src/core/safety-controller';

const now = 1_000_000;

describe('命令校验与安全上限', () => {
  it('接受完整的新鲜运行请求', () => {
    expect(parseToyCommand({ action: 'vibrate', intensity: 0.5, durationMs: 2000, commandId: 'cmd-1', createdAt: now }, now)).toMatchObject({ action: 'vibrate', intensity: 0.5 });
  });

  it.each([
    { action: 'vibrate', intensity: Number.NaN, durationMs: 1, commandId: 'a', createdAt: now },
    { action: 'vibrate', intensity: Infinity, durationMs: 1, commandId: 'a', createdAt: now },
    { action: 'vibrate', intensity: -1, durationMs: 1, commandId: 'a', createdAt: now },
    { action: 'vibrate', intensity: 1.1, durationMs: 1, commandId: 'a', createdAt: now },
    { action: 'vibrate', intensity: 0.1, durationMs: '100', commandId: 'a', createdAt: now },
    { action: 'vibrate', intensity: 0.1, durationMs: 100, commandId: 'a', createdAt: now, extra: true },
  ])('拒绝畸形请求 %#', (value) => expect(() => parseToyCommand(value, now)).toThrow());

  it('拒绝过期请求和数值字符串', () => {
    expect(() => parseToyCommand({ action: 'stop', commandId: 'old', createdAt: now - 15_001 }, now)).toThrow('过期');
    expect(() => parseToolVibrateArgs({ intensity: '0.2', duration_ms: 500 })).toThrow();
  });

  it('将合法请求降低到用户与代码上限', () => {
    expect(applySafetyLimits(0.9, 50_000, { maxIntensity: 0.4, maxDurationMs: 4_000 })).toEqual({
      requestedIntensity: 0.9,
      requestedDurationMs: 50_000,
      intensity: 0.4,
      durationMs: 4_000,
      wasLimited: true,
    });
  });
});
