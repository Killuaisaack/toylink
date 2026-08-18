import type {
  BleChecksum,
  BleFeatureEncoding,
  BleProfile,
  BleProfileCodec,
  DeclarativeBleProfile,
  LegacyBleProfile,
} from './types';

const LEGACY_PROFILE_KEYS = ['profileVersion', 'name', 'deviceNamePrefix', 'serviceUuid', 'writeCharacteristicUuid', 'writeType', 'commands'] as const;
const LEGACY_COMMAND_KEYS = ['stopHex', 'vibrateTemplateHex'] as const;
const PROFILE_KEYS = ['profileVersion', 'name', 'connection', 'features', 'stop'] as const;
const CONNECTION_KEYS = ['deviceNamePrefix', 'serviceUuid', 'writeCharacteristicUuid', 'writeType'] as const;
const CONNECTION_OPTIONAL_KEYS = ['notifyCharacteristicUuid'] as const;
const FEATURE_KEYS = ['id', 'type', 'label', 'encoding'] as const;
const ENCODING_KEYS = ['packetTemplateHex', 'value'] as const;
const ENCODING_OPTIONAL_KEYS = ['checksum'] as const;
const VALUE_KEYS = ['placeholder', 'inputMin', 'inputMax', 'outputMin', 'outputMax'] as const;
const CHECKSUM_KEYS = ['algorithm', 'rangeStart', 'rangeEnd', 'targetOffset'] as const;
const STOP_KEYS = ['packetHex'] as const;
const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHORT_UUID = /^(?:[0-9a-f]{4}|[0-9a-f]{8})$/i;
const HEX = /^(?:[0-9a-f]{2})+$/i;
const PLACEHOLDER = '{value_u8}';
const LEGACY_PLACEHOLDER = '{intensity_u8}';
export const MAX_PAYLOAD_BYTES = 64;

export class BleProfileValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'BleProfileValidationError'; }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string, optional: readonly string[] = []): void {
  const allowed = new Set([...keys, ...optional]);
  if (Object.keys(value).some((key) => !allowed.has(key)) || keys.some((key) => !(key in value))) {
    throw new BleProfileValidationError(`${label}\u5305\u542b\u7f3a\u5931\u6216\u4e0d\u652f\u6301\u7684\u5b57\u6bb5\u3002`);
  }
}

export function normalizeUuid(value: string): string {
  const lower = value.trim().toLowerCase();
  if (SHORT_UUID.test(lower)) {
    const base = lower.length === 4 ? `0000${lower}` : lower;
    return `${base}-0000-1000-8000-00805f9b34fb`;
  }
  if (!CANONICAL_UUID.test(lower)) throw new BleProfileValidationError('\u84dd\u7259\u6807\u8bc6\u683c\u5f0f\u4e0d\u6b63\u786e\u3002');
  return lower;
}

function parseHex(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new BleProfileValidationError(`${label}\u5fc5\u987b\u662f\u5341\u516d\u8fdb\u5236\u6587\u672c\u3002`);
  const normalized = value.replaceAll(/\s+/g, '').toUpperCase();
  if (!HEX.test(normalized)) throw new BleProfileValidationError(`${label}\u5fc5\u987b\u7531\u5b8c\u6574\u7684\u5341\u516d\u8fdb\u5236\u5b57\u8282\u7ec4\u6210\u3002`);
  if (normalized.length / 2 > MAX_PAYLOAD_BYTES) throw new BleProfileValidationError(`${label}\u4e0d\u80fd\u8d85\u8fc7 ${MAX_PAYLOAD_BYTES} \u5b57\u8282\u3002`);
  return normalized;
}

function parseSafeLabel(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string') throw new BleProfileValidationError(`${label}\u5fc5\u987b\u662f\u6587\u672c\u3002`);
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) throw new BleProfileValidationError(`${label}\u957f\u5ea6\u5fc5\u987b\u4e3a 1 \u5230 ${maxLength} \u4e2a\u5b57\u7b26\u3002`);
  for (let index = 0; index < normalized.length; index += 1) {
    const code = normalized.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) throw new BleProfileValidationError(`${label}\u4e0d\u80fd\u5305\u542b\u63a7\u5236\u5b57\u7b26\u3002`);
  }
  if (/(?:https?|wss?|javascript|data|file):/iu.test(normalized)) throw new BleProfileValidationError(`${label}\u4e0d\u80fd\u5305\u542b\u7f51\u5740\u6216\u53ef\u6267\u884c\u5185\u5bb9\u3002`);
  return normalized;
}

function parseLegacyTemplate(value: unknown): string {
  if (typeof value !== 'string') throw new BleProfileValidationError('\u8fd0\u884c\u6307\u4ee4\u6a21\u677f\u5fc5\u987b\u662f\u6587\u672c\u3002');
  const normalized = value.replaceAll(/\s+/g, '');
  if ((normalized.match(/\{intensity_u8\}/g) ?? []).length !== 1) throw new BleProfileValidationError('\u8fd0\u884c\u6307\u4ee4\u5fc5\u987b\u4e14\u53ea\u80fd\u5305\u542b\u4e00\u4e2a\u5f3a\u5ea6\u4f4d\u7f6e\u3002');
  if (/\{[^}]+\}/.test(normalized.replace(LEGACY_PLACEHOLDER, '00'))) throw new BleProfileValidationError('\u8fd0\u884c\u6307\u4ee4\u5305\u542b\u4e0d\u652f\u6301\u7684\u5360\u4f4d\u5185\u5bb9\u3002');
  parseHex(normalized.replace(LEGACY_PLACEHOLDER, '00'), '\u8fd0\u884c\u6307\u4ee4');
  return normalized.toUpperCase().replace('{INTENSITY_U8}', LEGACY_PLACEHOLDER);
}

function parseTemplate(value: unknown): string {
  if (typeof value !== 'string') throw new BleProfileValidationError('\u8fd0\u884c\u6307\u4ee4\u6a21\u677f\u5fc5\u987b\u662f\u6587\u672c\u3002');
  const normalized = value.replaceAll(/\s+/g, '');
  if ((normalized.match(/\{value_u8\}/g) ?? []).length !== 1) throw new BleProfileValidationError('\u6570\u503c\u6a21\u677f\u5fc5\u987b\u4e14\u53ea\u80fd\u5305\u542b\u4e00\u4e2a {value_u8} \u5360\u4f4d\u7b26\u3002');
  if (/\{[^}]+\}/.test(normalized.replace(PLACEHOLDER, '00'))) throw new BleProfileValidationError('\u6570\u503c\u6a21\u677f\u5305\u542b\u4e0d\u652f\u6301\u7684\u5360\u4f4d\u7b26\u3002');
  parseHex(normalized.replace(PLACEHOLDER, '00'), '\u6570\u503c\u6a21\u677f');
  return normalized.toUpperCase().replace('{VALUE_U8}', PLACEHOLDER);
}

function parseFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new BleProfileValidationError(`${label}\u5fc5\u987b\u662f\u6709\u9650\u6570\u5b57\u3002`);
  return value;
}

function parseOffset(value: unknown, label: string): number {
  const number = parseFiniteNumber(value, label);
  if (!Number.isSafeInteger(number) || number < 0 || number >= MAX_PAYLOAD_BYTES) throw new BleProfileValidationError(`${label}\u5fc5\u987b\u662f\u6709\u6548\u7684\u5b57\u8282\u4f4d\u7f6e\u3002`);
  return number;
}

function parseEncoding(input: unknown): BleFeatureEncoding {
  if (!isRecord(input)) throw new BleProfileValidationError('\u632f\u52a8\u7f16\u7801\u5fc5\u987b\u662f\u5bf9\u8c61\u3002');
  exactKeys(input, ENCODING_KEYS, '\u632f\u52a8\u7f16\u7801', ENCODING_OPTIONAL_KEYS);
  if (!isRecord(input.value)) throw new BleProfileValidationError('\u6570\u503c\u6620\u5c04\u5fc5\u987b\u662f\u5bf9\u8c61\u3002');
  exactKeys(input.value, VALUE_KEYS, '\u6570\u503c\u6620\u5c04');
  if (input.value.placeholder !== PLACEHOLDER) throw new BleProfileValidationError('\u53ea\u652f\u6301 {value_u8} \u5360\u4f4d\u7b26\u3002');
  const inputMin = parseFiniteNumber(input.value.inputMin, '\u8f93\u5165\u6700\u5c0f\u503c');
  const inputMax = parseFiniteNumber(input.value.inputMax, '\u8f93\u5165\u6700\u5927\u503c');
  const outputMin = parseFiniteNumber(input.value.outputMin, '\u8f93\u51fa\u6700\u5c0f\u503c');
  const outputMax = parseFiniteNumber(input.value.outputMax, '\u8f93\u51fa\u6700\u5927\u503c');
  if (!(inputMin < inputMax) || inputMin < 0 || inputMax > 1 || outputMin < 0 || outputMax > 255 || outputMin > outputMax) throw new BleProfileValidationError('\u6570\u503c\u8303\u56f4\u5fc5\u987b\u662f\u6709\u6548\u4e14\u53d7\u9650\u7684\u8303\u56f4\u3002');
  const packetTemplateHex = parseTemplate(input.packetTemplateHex);
  let checksum: BleChecksum | undefined;
  if (input.checksum !== undefined) {
    if (!isRecord(input.checksum)) throw new BleProfileValidationError('\u6821\u9a8c\u548c\u5fc5\u987b\u662f\u5bf9\u8c61\u3002');
    exactKeys(input.checksum, CHECKSUM_KEYS, '\u6821\u9a8c\u548c');
    if (input.checksum.algorithm !== 'sum8') throw new BleProfileValidationError('\u53ea\u652f\u6301 sum8 \u6821\u9a8c\u548c\u3002');
    checksum = { algorithm: 'sum8', rangeStart: parseOffset(input.checksum.rangeStart, '\u6821\u9a8c\u5f00\u59cb'), rangeEnd: parseOffset(input.checksum.rangeEnd, '\u6829\u7b97\u7ed3\u675f'), targetOffset: parseOffset(input.checksum.targetOffset, '\u6821\u9a8c\u5199\u5165\u4f4d\u7f6e') };
    const packetLength = packetTemplateHex.replace(PLACEHOLDER, '00').length / 2;
    if (checksum.rangeStart > checksum.rangeEnd || checksum.rangeEnd >= packetLength || checksum.targetOffset >= packetLength) throw new BleProfileValidationError('\u6821\u9a8c\u548c\u4f4d\u7f6e\u8d85\u51fa\u6307\u4ee4\u957f\u5ea6\u3002');
  }
  return { packetTemplateHex, value: { placeholder: PLACEHOLDER, inputMin, inputMax, outputMin, outputMax }, ...(checksum ? { checksum } : {}) };
}

function validateLegacy(input: Record<string, unknown>): LegacyBleProfile {
  exactKeys(input, LEGACY_PROFILE_KEYS, '\u84dd\u7259\u914d\u7f6e');
  if (input.profileVersion !== 1) throw new BleProfileValidationError('\u5f53\u524d\u53ea\u652f\u6301\u7248\u672c 1 \u7684\u914d\u7f6e\u3002');
  if (!isRecord(input.commands)) throw new BleProfileValidationError('\u84dd\u7259\u914d\u7f6e\u7f3a\u5c11\u6307\u4ee4\u3002');
  exactKeys(input.commands, LEGACY_COMMAND_KEYS, '\u8bbe\u5907\u6307\u4ee4');
  if (input.writeType !== 'with-response' && input.writeType !== 'without-response') throw new BleProfileValidationError('\u5199\u5165\u65b9\u5f0f\u65e0\u6548\u3002');
  return { profileVersion: 1, name: parseSafeLabel(input.name, '\u914d\u7f6e\u540d\u79f0', 80), deviceNamePrefix: parseSafeLabel(input.deviceNamePrefix, '\u8bbe\u5907\u540d\u79f0\u5f00\u5934', 64), serviceUuid: normalizeUuid(String(input.serviceUuid)), writeCharacteristicUuid: normalizeUuid(String(input.writeCharacteristicUuid)), writeType: input.writeType, commands: { stopHex: parseHex(input.commands.stopHex, '\u505c\u6b62\u6307\u4ee4'), vibrateTemplateHex: parseLegacyTemplate(input.commands.vibrateTemplateHex) } };
}

function validateDeclarative(input: Record<string, unknown>): DeclarativeBleProfile {
  exactKeys(input, PROFILE_KEYS, '\u84dd\u7259\u914d\u7f6e');
  if (input.profileVersion !== 1) throw new BleProfileValidationError('\u5f53\u524d\u53ea\u652f\u6301\u7248\u672c 1 \u7684\u914d\u7f6e\u3002');
  if (!isRecord(input.connection)) throw new BleProfileValidationError('\u7f3a\u5c11\u8fde\u63a5\u914d\u7f6e\u3002');
  exactKeys(input.connection, CONNECTION_KEYS, '\u8fde\u63a5\u914d\u7f6e', CONNECTION_OPTIONAL_KEYS);
  if (input.connection.writeType !== 'with-response' && input.connection.writeType !== 'without-response') throw new BleProfileValidationError('\u5199\u5165\u65b9\u5f0f\u65e0\u6548\u3002');
  if (!Array.isArray(input.features) || input.features.length < 1 || input.features.length > 16) throw new BleProfileValidationError('\u81f3\u5c11\u9700\u8981\u4e00\u9879\u8bbe\u5907\u80fd\u529b\u3002');
  const features = input.features.map((item, index) => {
    if (!isRecord(item)) throw new BleProfileValidationError(`\u80fd\u529b ${index + 1} \u5fc5\u987b\u662f\u5bf9\u8c61\u3002`);
    exactKeys(item, FEATURE_KEYS, `\u80fd\u529b ${index + 1}`);
    if (item.type !== 'vibrate') throw new BleProfileValidationError('\u5f53\u524d\u53ea\u652f\u6301 vibrate \u80fd\u529b\u3002');
    return { id: parseSafeLabel(item.id, '\u80fd\u529b\u6807\u8bc6', 64), type: 'vibrate' as const, label: parseSafeLabel(item.label, '\u80fd\u529b\u540d\u79f0', 80), encoding: parseEncoding(item.encoding) };
  });
  const ids = new Set<string>();
  for (const feature of features) { if (ids.has(feature.id)) throw new BleProfileValidationError('\u80fd\u529b\u6807\u8bc6\u4e0d\u80fd\u91cd\u590d\u3002'); ids.add(feature.id); }
  if (!isRecord(input.stop)) throw new BleProfileValidationError('\u7f3a\u5c11\u505c\u6b62\u6307\u4ee4\u3002');
  exactKeys(input.stop, STOP_KEYS, '\u505c\u6b62\u6307\u4ee4');
  return { profileVersion: 1, name: parseSafeLabel(input.name, '\u914d\u7f6e\u540d\u79f0', 80), connection: { deviceNamePrefix: parseSafeLabel(input.connection.deviceNamePrefix, '\u8bbe\u5907\u540d\u79f0\u5f00\u5934', 64), serviceUuid: normalizeUuid(String(input.connection.serviceUuid)), writeCharacteristicUuid: normalizeUuid(String(input.connection.writeCharacteristicUuid)), ...(typeof input.connection.notifyCharacteristicUuid === 'undefined' ? {} : { notifyCharacteristicUuid: normalizeUuid(typeof input.connection.notifyCharacteristicUuid === 'string' ? input.connection.notifyCharacteristicUuid : '') }), writeType: input.connection.writeType }, features, stop: { packetHex: parseHex(input.stop.packetHex, '\u505c\u6b62\u6307\u4ee4') } };
}

function isDeclarative(profile: BleProfile): profile is DeclarativeBleProfile { return 'connection' in profile; }
function hexToBytes(hex: string): Uint8Array { const bytes = new Uint8Array(hex.length / 2); for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16); return bytes; }
function mapValue(value: number, inputMin: number, inputMax: number, outputMin: number, outputMax: number): number { const ratio = (value - inputMin) / (inputMax - inputMin); return Math.round(outputMin + Math.min(1, Math.max(0, ratio)) * (outputMax - outputMin)); }
function encodeDeclarative(feature: DeclarativeBleProfile['features'][number], intensity: number): Uint8Array {
  const mapped = mapValue(intensity, feature.encoding.value.inputMin, feature.encoding.value.inputMax, feature.encoding.value.outputMin, feature.encoding.value.outputMax);
  const bytes = hexToBytes(feature.encoding.packetTemplateHex.replace(PLACEHOLDER, mapped.toString(16).padStart(2, '0')));
  const checksum = feature.encoding.checksum;
  if (checksum?.algorithm === 'sum8') { let sum = 0; for (let index = checksum.rangeStart; index <= checksum.rangeEnd; index += 1) sum = (sum + bytes[index]!) & 0xff; bytes[checksum.targetOffset] = sum; }
  return bytes;
}

export function getBleConnection(profile: BleProfile): { deviceNamePrefix: string; serviceUuid: string; writeCharacteristicUuid: string; notifyCharacteristicUuid?: string; writeType: 'with-response' | 'without-response' } {
  return isDeclarative(profile) ? profile.connection : { deviceNamePrefix: profile.deviceNamePrefix, serviceUuid: profile.serviceUuid, writeCharacteristicUuid: profile.writeCharacteristicUuid, writeType: profile.writeType };
}

export function getBleFeatures(profile: BleProfile): readonly { id: string; label: string }[] {
  return isDeclarative(profile) ? profile.features.map((feature) => ({ id: feature.id, label: feature.label })) : [{ id: 'vibrate', label: '\u632f\u52a8' }];
}

export class StrictBleProfileCodec implements BleProfileCodec {
  validate(input: unknown): BleProfile { if (!isRecord(input)) throw new BleProfileValidationError('\u84dd\u7259\u914d\u7f6e\u5fc5\u987b\u662f JSON \u5bf9\u8c61\u3002'); return 'connection' in input ? validateDeclarative(input) : validateLegacy(input); }
  encodeVibrate(profile: BleProfile, intensity: number): Uint8Array {
    if (!Number.isFinite(intensity) || intensity < 0 || intensity > 1) throw new BleProfileValidationError('\u5f3a\u5ea6\u5fc5\u987b\u5728 0 \u5230 1 \u4e4b\u95f4\u3002');
    if (isDeclarative(profile)) return encodeDeclarative(profile.features[0]!, intensity);
    const byte = Math.round(intensity * 255).toString(16).padStart(2, '0').toUpperCase();
    return hexToBytes(profile.commands.vibrateTemplateHex.replace(LEGACY_PLACEHOLDER, byte));
  }
  encodeStop(profile: BleProfile): Uint8Array { return hexToBytes(isDeclarative(profile) ? profile.stop.packetHex : profile.commands.stopHex); }
}

export function bytesToHex(bytes: Uint8Array): string { return [...bytes].map((value) => value.toString(16).padStart(2, '0').toUpperCase()).join(' '); }
