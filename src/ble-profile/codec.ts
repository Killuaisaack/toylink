import type { BleProfile, BleProfileCodec } from './types';

const PROFILE_KEYS = ['profileVersion', 'name', 'deviceNamePrefix', 'serviceUuid', 'writeCharacteristicUuid', 'writeType', 'commands'] as const;
const COMMAND_KEYS = ['stopHex', 'vibrateTemplateHex'] as const;
const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHORT_UUID = /^(?:[0-9a-f]{4}|[0-9a-f]{8})$/i;
const HEX = /^(?:[0-9a-f]{2})+$/i;
const MAX_PAYLOAD_BYTES = 64;

export class BleProfileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BleProfileValidationError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new BleProfileValidationError(`${label}包含缺失或不支持的字段。`);
  }
}

export function normalizeUuid(value: string): string {
  const lower = value.trim().toLowerCase();
  if (SHORT_UUID.test(lower)) {
    const base = lower.length === 4 ? `0000${lower}` : lower;
    return `${base}-0000-1000-8000-00805f9b34fb`;
  }
  if (!CANONICAL_UUID.test(lower)) throw new BleProfileValidationError('蓝牙服务标识格式不正确。');
  return lower;
}

function parseHex(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new BleProfileValidationError(`${label}必须是十六进制文本。`);
  const normalized = value.replaceAll(/\s+/g, '').toUpperCase();
  if (!HEX.test(normalized)) throw new BleProfileValidationError(`${label}必须由完整的十六进制字节组成。`);
  if (normalized.length / 2 > MAX_PAYLOAD_BYTES) throw new BleProfileValidationError(`${label}不能超过 ${MAX_PAYLOAD_BYTES} 字节。`);
  return normalized;
}

function parseSafeLabel(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string') throw new BleProfileValidationError(`${label}必须是文本。`);
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new BleProfileValidationError(`${label}长度必须为 1 到 ${maxLength} 个字符。`);
  }
  let hasControlCharacter = false;
  for (let index = 0; index < normalized.length; index += 1) {
    const code = normalized.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) { hasControlCharacter = true; break; }
  }
  if (hasControlCharacter) {
    throw new BleProfileValidationError(`${label}不能包含控制字符。`);
  }
  if (/(?:https?|wss?|javascript|data|file):/iu.test(normalized)) {
    throw new BleProfileValidationError(`${label}不能包含网址或可执行内容。`);
  }
  return normalized;
}

function parseTemplate(value: unknown): string {
  if (typeof value !== 'string') throw new BleProfileValidationError('运行指令模板必须是文本。');
  const normalized = value.replaceAll(/\s+/g, '');
  const matches = normalized.match(/\{intensity_u8\}/g) ?? [];
  if (matches.length !== 1) throw new BleProfileValidationError('运行指令必须且只能包含一个强度位置。');
  if (/\{[^}]+\}/.test(normalized.replace('{intensity_u8}', ''))) {
    throw new BleProfileValidationError('运行指令包含不支持的占位内容。');
  }
  parseHex(normalized.replace('{intensity_u8}', '00'), '运行指令');
  return normalized.toUpperCase().replace('{INTENSITY_U8}', '{intensity_u8}');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

export class StrictBleProfileCodec implements BleProfileCodec {
  validate(input: unknown): BleProfile {
    if (!isRecord(input)) throw new BleProfileValidationError('蓝牙配置必须是一个 JSON 对象。');
    exactKeys(input, PROFILE_KEYS, '蓝牙配置');
    if (input.profileVersion !== 1) throw new BleProfileValidationError('当前只支持版本 1 的蓝牙配置。');
    const profileName = parseSafeLabel(input.name, '配置名称', 80);
    const deviceNamePrefix = parseSafeLabel(input.deviceNamePrefix, '设备名称开头', 64);
    if (input.writeType !== 'with-response' && input.writeType !== 'without-response') {
      throw new BleProfileValidationError('写入方式无效。');
    }
    if (!isRecord(input.commands)) throw new BleProfileValidationError('蓝牙配置缺少设备指令。');
    exactKeys(input.commands, COMMAND_KEYS, '设备指令');
    return {
      profileVersion: 1,
      name: profileName,
      deviceNamePrefix,
      serviceUuid: normalizeUuid(String(input.serviceUuid)),
      writeCharacteristicUuid: normalizeUuid(String(input.writeCharacteristicUuid)),
      writeType: input.writeType,
      commands: {
        stopHex: parseHex(input.commands.stopHex, '停止指令'),
        vibrateTemplateHex: parseTemplate(input.commands.vibrateTemplateHex),
      },
    };
  }

  encodeVibrate(profile: BleProfile, intensity: number): Uint8Array {
    if (!Number.isFinite(intensity) || intensity < 0 || intensity > 1) throw new BleProfileValidationError('强度必须在 0 到 1 之间。');
    const byte = Math.round(intensity * 255).toString(16).padStart(2, '0').toUpperCase();
    return hexToBytes(profile.commands.vibrateTemplateHex.replace('{intensity_u8}', byte));
  }

  encodeStop(profile: BleProfile): Uint8Array {
    return hexToBytes(profile.commands.stopHex);
  }
}

export function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((value) => value.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}
