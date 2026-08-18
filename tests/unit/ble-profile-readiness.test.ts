import { describe, expect, it } from 'vitest';
import { getProfileReadiness } from '../../src/ble-profile/readiness';

const valid = {
  profileVersion: 1,
  name: 'Synthetic profile',
  connection: { deviceNamePrefix: 'Synthetic', serviceUuid: 'ffe0', writeCharacteristicUuid: 'ffe1', writeType: 'without-response' },
  features: [{ id: 'vibrate', type: 'vibrate', label: 'Vibration', encoding: { packetTemplateHex: 'AA{value_u8}', value: { placeholder: '{value_u8}', inputMin: 0, inputMax: 1, outputMin: 0, outputMax: 255 } } }],
  stop: { packetHex: '00' },
};

describe('BLE profile readiness', () => {
  it('reports draft for incomplete input', () => {
    const result = getProfileReadiness(undefined);
    expect(result.state).toBe('draft');
    expect(result.valid).toBe(false);
  });

  it('requires local human verification before controllable state', () => {
    expect(getProfileReadiness(valid).state).toBe('connectable');
    expect(getProfileReadiness(valid, true).state).toBe('controllable');
  });
});
