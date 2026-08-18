import { COMMAND_FRESHNESS_MS, COMMAND_FUTURE_TOLERANCE_MS } from './constants';
import type { ToyCommand } from './commands';

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

export class CommandValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommandValidationError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertExactKeys(value: Record<string, unknown>, expected: readonly string[]): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new CommandValidationError('请求内容包含缺失或不支持的字段。');
  }
}

function parseCommon(value: Record<string, unknown>, now: number): { commandId: string; createdAt: number } {
  if (typeof value.commandId !== 'string' || !ID_PATTERN.test(value.commandId)) {
    throw new CommandValidationError('请求编号无效。');
  }
  if (typeof value.createdAt !== 'number' || !Number.isSafeInteger(value.createdAt)) {
    throw new CommandValidationError('请求时间无效。');
  }
  if (now - value.createdAt > COMMAND_FRESHNESS_MS) throw new CommandValidationError('这个请求已经过期。');
  if (value.createdAt - now > COMMAND_FUTURE_TOLERANCE_MS) throw new CommandValidationError('请求时间异常。');
  return { commandId: value.commandId, createdAt: value.createdAt };
}

export function parseToyCommand(input: unknown, now: number): ToyCommand {
  if (!isRecord(input) || (input.action !== 'vibrate' && input.action !== 'stop')) {
    throw new CommandValidationError('不支持这个请求。');
  }
  if (input.action === 'stop') {
    assertExactKeys(input, ['action', 'commandId', 'createdAt']);
    return { action: 'stop', ...parseCommon(input, now) };
  }
  assertExactKeys(input, ['action', 'intensity', 'durationMs', 'commandId', 'createdAt']);
  const common = parseCommon(input, now);
  if (typeof input.intensity !== 'number' || !Number.isFinite(input.intensity) || input.intensity < 0 || input.intensity > 1) {
    throw new CommandValidationError('强度必须是 0 到 1 之间的数字。');
  }
  if (typeof input.durationMs !== 'number' || !Number.isSafeInteger(input.durationMs) || input.durationMs <= 0) {
    throw new CommandValidationError('时长必须是正整数。');
  }
  return { action: 'vibrate', intensity: input.intensity, durationMs: input.durationMs, ...common };
}

export interface ToolVibrateArgs { feature: string; intensity: number; duration_ms: number }

export function parseToolVibrateArgs(input: unknown): ToolVibrateArgs {
  if (!isRecord(input)) throw new CommandValidationError('角色请求格式不正确。');
  const keys = Object.keys(input).sort();
  const legacyKeys = ['duration_ms', 'intensity'];
  const featureKeys = ['duration_ms', 'feature', 'intensity'];
  if (keys.join('|') !== legacyKeys.join('|') && keys.join('|') !== featureKeys.join('|')) {
    throw new CommandValidationError('角色请求包含缺失或不支持的字段。');
  }
  const feature = input.feature === undefined ? 'vibrate' : input.feature;
  if (typeof feature !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(feature)) {
    throw new CommandValidationError('角色提供的设备能力无效。');
  }
  if (typeof input.intensity !== 'number' || !Number.isFinite(input.intensity) || input.intensity < 0 || input.intensity > 1) {
    throw new CommandValidationError('角色提供的强度无效。');
  }
  if (typeof input.duration_ms !== 'number' || !Number.isSafeInteger(input.duration_ms) || input.duration_ms <= 0) {
    throw new CommandValidationError('角色提供的时长无效。');
  }
  return { feature, intensity: input.intensity, duration_ms: input.duration_ms };
}
