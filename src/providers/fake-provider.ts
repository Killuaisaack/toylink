import type { ProviderKind, ToyDeviceSummary, ToyProviderConfig } from './toy-provider';
import { EventedToyProvider } from './toy-provider';

export class FakeProvider extends EventedToyProvider {
  constructor(readonly kind: ProviderKind = 'intiface') { super(); }
  connected = false;
  scanning = false;
  selectedId: string | null = null;
  readonly calls: string[] = [];
  devices: ToyDeviceSummary[] = [{ id: 'fake-1', name: '模拟设备', capabilities: { vibrate: true } }];
  failVibrate = false;
  failStopCount = 0;

  async connect(_config: ToyProviderConfig): Promise<void> {
    this.connected = true;
    this.calls.push('connect');
    this.emit({ type: 'connection', connected: true });
  }

  async disconnect(): Promise<void> {
    this.calls.push('disconnect');
    this.connected = false;
    this.selectedId = null;
    this.emit({ type: 'connection', connected: false });
  }

  async startScanning(): Promise<void> {
    this.calls.push('startScanning');
    this.scanning = true;
    this.emit({ type: 'scanning', scanning: true });
    this.emit({ type: 'devices-changed', devices: this.devices });
  }

  async stopScanning(): Promise<void> {
    this.calls.push('stopScanning');
    this.scanning = false;
    this.emit({ type: 'scanning', scanning: false });
  }

  listDevices(): readonly ToyDeviceSummary[] { return this.devices; }

  async selectDevice(deviceId: string): Promise<void> {
    if (!this.devices.some((device) => device.id === deviceId)) throw new Error('找不到这个设备。');
    this.selectedId = deviceId;
    this.calls.push(`select:${deviceId}`);
  }

  async vibrate(intensity: number, durationMs: number, commandId: string): Promise<void> {
    this.calls.push(`vibrate:${intensity}:${durationMs}:${commandId}`);
    if (this.failVibrate) throw new Error('模拟运行失败');
  }

  async stop(): Promise<void> {
    this.calls.push('stop');
    if (this.failStopCount > 0) {
      this.failStopCount -= 1;
      throw new Error('模拟停止失败');
    }
  }

  isConnected(): boolean { return this.connected; }

  removeDevice(deviceId: string): void {
    this.devices = this.devices.filter((device) => device.id !== deviceId);
    this.emit({ type: 'device-removed', deviceId });
    this.emit({ type: 'devices-changed', devices: this.devices });
  }
}
