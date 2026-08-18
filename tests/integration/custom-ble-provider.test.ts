import { describe, expect, it, vi } from 'vitest';
import type { BleProfile, BleWriteType, StoredBleProfile } from '../../src/ble-profile/types';
import { CustomBleProvider, type WebBluetoothPort } from '../../src/providers/custom-ble-provider';

const profile: BleProfile = {
  profileVersion: 1,
  name: '合成配置',
  deviceNamePrefix: 'Example',
  serviceUuid: '0000ffe0-0000-1000-8000-00805f9b34fb',
  writeCharacteristicUuid: '0000ffe1-0000-1000-8000-00805f9b34fb',
  writeType: 'without-response',
  commands: { stopHex: '00', vibrateTemplateHex: '01{intensity_u8}' },
};

class FakeBlePort implements WebBluetoothPort {
  supported = true;
  connected = false;
  writes: Array<{ bytes: number[]; type: BleWriteType }> = [];
  listeners = new Set<() => void>();
  failWrite = false;
  isSupported(): boolean { return this.supported; }
  async requestAndConnect(): Promise<{ name: string }> { this.connected = true; return { name: '<img src=x onerror=alert(1)>' }; }
  async write(payload: Uint8Array, type: BleWriteType): Promise<void> { if (this.failWrite) throw new Error('写入失败'); this.writes.push({ bytes: [...payload], type }); }
  async disconnect(): Promise<void> { this.connected = false; }
  isConnected(): boolean { return this.connected; }
  onDisconnected(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  triggerDisconnect(): void { this.connected = false; for (const listener of this.listeners) listener(); }
}

describe('自定义蓝牙连接模块', () => {
  const stored: StoredBleProfile = { id: 'p1', profile };

  it('通过系统选择、再次明确选择、预览后写入和停止', async () => {
    const port = new FakeBlePort();
    const preview = vi.fn(async () => true);
    const provider = new CustomBleProvider((id) => id === 'p1' ? stored : undefined, port, undefined, preview);
    await provider.connect({ bleProfileId: 'p1' });
    expect(provider.listDevices()).toHaveLength(0);
    await provider.startScanning();
    expect(provider.listDevices()).toHaveLength(1);
    const device = provider.listDevices()[0];
    expect(device?.name).toContain('<img');
    await provider.selectDevice(device!.id);
    await provider.vibrate(0.5, 500, 'x');
    await provider.stop();
    expect(preview).toHaveBeenCalledWith({ profileName: '合成配置', payloadHex: '01 80' });
    expect(port.writes.map((item) => item.bytes)).toEqual([[1, 128], [0]]);
  });

  it('用户取消首次预览时不写入', async () => {
    const port = new FakeBlePort();
    const provider = new CustomBleProvider(() => stored, port, undefined, async () => false);
    await provider.connect({ bleProfileId: 'p1' });
    await provider.startScanning();
    await provider.selectDevice(provider.listDevices()[0]!.id);
    await expect(provider.vibrate(0.1, 100, 'x')).rejects.toThrow('取消');
    expect(port.writes).toHaveLength(0);
  });

  it('不支持、断开和写入失败都安全上报', async () => {
    const unsupported = new FakeBlePort(); unsupported.supported = false;
    const unsupportedProvider = new CustomBleProvider(() => stored, unsupported);
    await unsupportedProvider.connect({ bleProfileId: 'p1' });
    await expect(unsupportedProvider.startScanning()).rejects.toThrow('不支持');

    const port = new FakeBlePort();
    const provider = new CustomBleProvider(() => stored, port);
    const eventTypes: string[] = [];
    provider.subscribe((event) => eventTypes.push(event.type));
    await provider.connect({ bleProfileId: 'p1' });
    await provider.startScanning();
    await provider.selectDevice(provider.listDevices()[0]!.id);
    port.failWrite = true;
    await expect(provider.vibrate(0.1, 100, 'x')).rejects.toThrow('写入失败');
    port.triggerDisconnect();
    expect(eventTypes).toContain('device-removed');
  });
});
