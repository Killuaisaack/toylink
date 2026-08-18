export type BleWriteType = 'with-response' | 'without-response';

export interface BleProfile {
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

export interface StoredBleProfile {
  id: string;
  profile: BleProfile;
}

export interface BleProfileCodec {
  validate(profile: unknown): BleProfile;
  encodeVibrate(profile: BleProfile, intensity: number): Uint8Array;
  encodeStop(profile: BleProfile): Uint8Array;
}
