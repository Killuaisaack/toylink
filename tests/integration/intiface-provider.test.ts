import { describe, expect, it } from 'vitest';
import type { ToyDeviceSummary } from '../../src/providers/toy-provider';
import { IntifaceProvider, type IntifacePort, type IntifacePortEvent } from '../../src/providers/intiface-provider';

class FakeIntifacePort implements IntifacePort {
  connected = false;
  scanning = false;
  devices: ToyDeviceSummary[] = [{ id: '7', name: '测试设备', capabilities: { vibrate: true } }];
  calls: string[] = [];
  listeners = new Set<(event: IntifacePortEvent) => void>();
  async connect(endpoint: string): Promise<void> { this.calls.push(`connect:${endpoint}`); this.connected = true; this.emit({ type: 'connected', connected: true }); }
  async disconnect(): Promise<void> { this.calls.push('disconnect'); this.connected = false; this.emit({ type: 'connected', connected: false }); }
  async startScanning(): Promise<void> { this.scanning = true; this.calls.push('scan'); this.emit({ type: 'scanning', scanning: true }); }
  async stopScanning(): Promise<void> { this.scanning = false; this.calls.push('stopScan'); this.emit({ type: 'scanning', scanning: false }); }
  listDevices(): readonly ToyDeviceSummary[] { return this.devices; }
  async vibrate(deviceId: string, intensity: number): Promise<void> { this.calls.push(`vibrate:${deviceId}:${intensity}`); }
  async stop(deviceId: string): Promise<void> { this.calls.push(`stop:${deviceId}`); }
  isConnected(): boolean { return this.connected; }
  subscribe(listener: (event: IntifacePortEvent) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  emit(event: IntifacePortEvent): void { for (const listener of this.listeners) listener(event); }
}

describe('Intiface 连接模块', () => {
  it('连接、发现、明确选择、运行和停止', async () => {
    const port = new FakeIntifacePort();
    const provider = new IntifaceProvider(port);
    await provider.connect({ endpoint: 'ws://127.0.0.1:12345' });
    await provider.startScanning();
    expect(provider.listDevices()).toHaveLength(1);
    await provider.selectDevice('7');
    await provider.vibrate(0.2, 500, 'x');
    await provider.stop();
    expect(port.calls).toContain('vibrate:7:0.2');
    expect(port.calls).toContain('stop:7');
  });

  it('设备移除会传播并清空选择', async () => {
    const port = new FakeIntifacePort();
    const provider = new IntifaceProvider(port);
    const events: string[] = [];
    provider.subscribe((event) => events.push(event.type));
    await provider.connect({ endpoint: 'ws://127.0.0.1:12345' });
    await provider.selectDevice('7');
    port.devices = [];
    port.emit({ type: 'removed', deviceId: '7' });
    await expect(provider.vibrate(0.1, 100, 'x')).rejects.toThrow('先选择');
    expect(events).toContain('device-removed');
  });
});
