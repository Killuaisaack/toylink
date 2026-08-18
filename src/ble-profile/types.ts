export type BleWriteType = 'with-response' | 'without-response';

export interface LegacyBleProfile {
  profileVersion: 1;
  name: string;
  deviceNamePrefix: string;
  serviceUuid: string;
  writeCharacteristicUuid: string;
  writeType: BleWriteType;
  commands: {
    stopHex: string;
    vibrateTemplateHex: string;
  };
}

export interface BleValueMapping {
  placeholder: '{value_u8}';
  inputMin: number;
  inputMax: number;
  outputMin: number;
  outputMax: number;
}

export interface BleChecksum {
  algorithm: 'sum8';
  rangeStart: number;
  rangeEnd: number;
  targetOffset: number;
}

export interface BleFeatureEncoding {
  packetTemplateHex: string;
  value: BleValueMapping;
  checksum?: BleChecksum;
}

export interface BleProfileFeature {
  id: string;
  type: 'vibrate';
  label: string;
  encoding: BleFeatureEncoding;
}

export interface DeclarativeBleProfile {
  profileVersion: 1;
  name: string;
  /** 兼容旧版扁平配置，新的配置使用 connection 字段。 */
  serviceUuid?: string;
  writeCharacteristicUuid?: string;
  writeType?: BleWriteType;
  connection: {
    deviceNamePrefix: string;
    serviceUuid: string;
    writeCharacteristicUuid: string;
    notifyCharacteristicUuid?: string;
    writeType: BleWriteType;
  };
  features: readonly BleProfileFeature[];
  stop: { packetHex: string };
}

export type BleProfile = LegacyBleProfile | DeclarativeBleProfile;

export interface StoredBleProfile {
  id: string;
  profile: BleProfile;
  /** 只在当前页面会话内记录人工首次确认。 */
  locallyVerified?: boolean;
}

export interface BleProfileCodec {
  validate(profile: unknown): BleProfile;
  encodeVibrate(profile: BleProfile, intensity: number): Uint8Array;
  encodeStop(profile: BleProfile): Uint8Array;
}
