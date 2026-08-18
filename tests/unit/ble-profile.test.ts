import { describe, expect, it } from 'vitest';
import { bytesToHex, StrictBleProfileCodec } from '../../src/ble-profile/codec';

const valid = {
  profileVersion: 1,
  name: '合成测试配置',
  deviceNamePrefix: 'Example',
  serviceUuid: 'ffe0',
  writeCharacteristicUuid: '0000ffe1',
  writeType: 'without-response',
  commands: { stopHex: '550400000000AA', vibrateTemplateHex: '5504000001{intensity_u8}AA' },
};

describe('声明式蓝牙配置', () => {
  const codec = new StrictBleProfileCodec();

  it('校验、规范化 UUID 并安全编码强度', () => {
    const profile = codec.validate(valid);
    expect(profile.serviceUuid).toBe('0000ffe0-0000-1000-8000-00805f9b34fb');
    expect(bytesToHex(codec.encodeVibrate(profile, 0.5))).toBe('55 04 00 00 01 80 AA');
    expect(bytesToHex(codec.encodeStop(profile))).toBe('55 04 00 00 00 00 AA');
  });

  it.each([
    { ...valid, profileVersion: 2 },
    { ...valid, extra: true },
    { ...valid, serviceUuid: 'not-a-uuid' },
    { ...valid, name: 'https://example.test' },
    { ...valid, deviceNamePrefix: 'javascript:bad' },
    { ...valid, commands: { ...valid.commands, stopHex: 'ABC' } },
    { ...valid, commands: { ...valid.commands, stopHex: '' } },
    { ...valid, commands: { ...valid.commands, vibrateTemplateHex: 'AA{unknown}BB' } },
    { ...valid, commands: { ...valid.commands, vibrateTemplateHex: 'AA{intensity_u8}{intensity_u8}' } },
  ])('拒绝不安全配置 %#', (profile) => expect(() => codec.validate(profile)).toThrow());

  it('限制最终指令长度', () => {
    const huge = 'AA'.repeat(65);
    expect(() => codec.validate({ ...valid, commands: { ...valid.commands, stopHex: huge } })).toThrow('64');
  });
});
