import { describe, expect, it } from 'vitest';
import { bytesToHex, StrictBleProfileCodec } from '../../src/ble-profile/codec';

const baseDeclarative = {
  profileVersion: 1,
  name: 'Synthetic profile',
  connection: {
    deviceNamePrefix: 'Synthetic',
    serviceUuid: 'ffe0',
    writeCharacteristicUuid: 'ffe1',
    writeType: 'without-response',
  },
  features: [{
    id: 'vibrate', type: 'vibrate', label: 'Synthetic vibration',
    encoding: {
      packetTemplateHex: 'AA{value_u8}00',
      value: { placeholder: '{value_u8}', inputMin: 0, inputMax: 1, outputMin: 0, outputMax: 255 },
    },
  }],
  stop: { packetHex: '0000' },
} as const;

describe('declarative BLE profile codec', () => {
  const codec = new StrictBleProfileCodec();

  it('accepts optional notify UUID and maps bounded values', () => {
    const profile = codec.validate({
      ...baseDeclarative,
      connection: { ...baseDeclarative.connection, notifyCharacteristicUuid: '0000ffe2-0000-1000-8000-00805f9b34fb' },
    });
    expect(profile).toMatchObject({ connection: { serviceUuid: '0000ffe0-0000-1000-8000-00805f9b34fb' } });
    expect(bytesToHex(codec.encodeVibrate(profile, 0.5))).toBe('AA 80 00');
    expect(bytesToHex(codec.encodeStop(profile))).toBe('00 00');
  });

  it('supports synthetic sum8 checksum without mutating input', () => {
    const input = {
      ...baseDeclarative,
      features: [{
        ...baseDeclarative.features[0],
        encoding: {
          ...baseDeclarative.features[0].encoding,
          packetTemplateHex: '01{value_u8}0000',
          checksum: { algorithm: 'sum8', rangeStart: 0, rangeEnd: 2, targetOffset: 3 },
        },
      }],
    };
    const before = JSON.stringify(input);
    const profile = codec.validate(input);
    expect(bytesToHex(codec.encodeVibrate(profile, 0.5))).toBe('01 80 00 81');
    expect(JSON.stringify(input)).toBe(before);
  });

  it.each([
    { ...baseDeclarative, extra: true },
    { ...baseDeclarative, connection: { ...baseDeclarative.connection, notifyCharacteristicUuid: 'bad' } },
    { ...baseDeclarative, features: [{ ...baseDeclarative.features[0], encoding: { ...baseDeclarative.features[0].encoding, checksum: { algorithm: 'xor8', rangeStart: 0, rangeEnd: 1, targetOffset: 2 } } }] },
    { ...baseDeclarative, features: [{ ...baseDeclarative.features[0], encoding: { ...baseDeclarative.features[0].encoding, checksum: { algorithm: 'sum8', rangeStart: 0, rangeEnd: 3, targetOffset: 2 } } }] },
    { ...baseDeclarative, features: [{ ...baseDeclarative.features[0], encoding: { ...baseDeclarative.features[0].encoding, packetTemplateHex: 'AA{value_u8}{value_u8}' } }] },
  ])('rejects unsafe declarative data %#', (profile) => expect(() => codec.validate(profile)).toThrow());
});
