import {
  ButtplugBrowserWebsocketClientConnector,
  ButtplugClient,
  DeviceOutput,
  OutputType,
  type ButtplugClientDevice,
} from 'buttplug';
import { isValidWebSocketEndpoint } from '../core/settings';
import type { ToyDeviceSummary, ToyProviderConfig } from './toy-provider';
import { EventedToyProvider } from './toy-provider';

export type IntifacePortEvent =
  | { type: 'connected'; connected: boolean }
  | { type: 'scanning'; scanning: boolean }
  | { type: 'devices'; devices: readonly ToyDeviceSummary[] }
  | { type: 'removed'; deviceId: string };

export interface IntifacePort {
  connect(endpoint: string): Promise<void>;
  disconnect(): Promise<void>;
  startScanning(): Promise<void>;
  stopScanning(): Promise<void>;
  listDevices(): readonly ToyDeviceSummary[];
  vibrate(deviceId: string, intensity: number): Promise<void>;
  stop(deviceId: string): Promise<void>;
  isConnected(): boolean;
  subscribe(listener: (event: IntifacePortEvent) => void): () => void;
}

export class ButtplugIntifacePort implements IntifacePort {
  private client: ButtplugClient | null = null;
  private readonly listeners = new Set<(event: IntifacePortEvent) => void>();

  async connect(endpoint: string): Promise<void> {
    await this.disconnect();
    const client = new ButtplugClient('ToyLink');
    client.addListener('deviceadded', () => this.emitDevices());
    client.addListener('deviceremoved', (device: ButtplugClientDevice) => {
      this.emit({ type: 'removed', deviceId: String(device.index) });
      this.emitDevices();
    });
    client.addListener('scanningfinished', () => this.emit({ type: 'scanning', scanning: false }));
    client.addListener('disconnect', () => this.emit({ type: 'connected', connected: false }));
    await client.connect(new ButtplugBrowserWebsocketClientConnector(endpoint));
    this.client = client;
    this.emit({ type: 'connected', connected: true });
    this.emitDevices();
  }

  async disconnect(): Promise<void> {
    const current = this.client;
    this.client = null;
    if (current?.connected) await current.disconnect();
    this.emit({ type: 'connected', connected: false });
  }

  async startScanning(): Promise<void> {
    const client = this.requireClient();
    await client.startScanning();
    this.emit({ type: 'scanning', scanning: true });
  }

  async stopScanning(): Promise<void> {
    const client = this.requireClient();
    if (client.isScanning) await client.stopScanning();
    this.emit({ type: 'scanning', scanning: false });
  }

  listDevices(): readonly ToyDeviceSummary[] {
    const client = this.client;
    if (!client) return [];
    return [...client.devices.values()]
      .filter((device) => device.hasOutput(OutputType.Vibrate))
      .map((device) => ({
        id: String(device.index),
        name: device.displayName?.trim() || device.name || '未命名设备',
        capabilities: { vibrate: true },
      }));
  }

  async vibrate(deviceId: string, intensity: number): Promise<void> {
    const device = this.getDevice(deviceId);
    await device.runOutput(DeviceOutput.Vibrate.percent(intensity));
  }

  async stop(deviceId: string): Promise<void> {
    await this.getDevice(deviceId).stop();
  }

  isConnected(): boolean { return this.client?.connected === true; }

  subscribe(listener: (event: IntifacePortEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private requireClient(): ButtplugClient {
    if (!this.client?.connected) throw new Error('尚未连接 Intiface。');
    return this.client;
  }

  private getDevice(deviceId: string): ButtplugClientDevice {
    const index = Number.parseInt(deviceId, 10);
    const device = this.requireClient().devices.get(index);
    if (!device || !device.hasOutput(OutputType.Vibrate)) throw new Error('已选择的设备不可用。');
    return device;
  }

  private emitDevices(): void { this.emit({ type: 'devices', devices: this.listDevices() }); }
  private emit(event: IntifacePortEvent): void { for (const listener of this.listeners) listener(event); }
}

function safeError(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    const message = error.message.trim();
    if (message && /[\u3400-\u9fff]/u.test(message) && !/wss?:\/\//i.test(message)) return message.slice(0, 200);
  }
  return fallback;
}

export class IntifaceProvider extends EventedToyProvider {
  readonly kind = 'intiface' as const;
  private selectedDeviceId: string | null = null;
  private readonly unsubscribe: () => void;

  constructor(private readonly port: IntifacePort = new ButtplugIntifacePort()) {
    super();
    this.unsubscribe = this.port.subscribe((event) => {
      if (event.type === 'connected') {
        if (!event.connected) this.selectedDeviceId = null;
        this.emit({ type: 'connection', connected: event.connected });
      } else if (event.type === 'scanning') {
        this.emit({ type: 'scanning', scanning: event.scanning });
      } else if (event.type === 'devices') {
        this.emit({ type: 'devices-changed', devices: event.devices });
      } else {
        if (this.selectedDeviceId === event.deviceId) this.selectedDeviceId = null;
        this.emit({ type: 'device-removed', deviceId: event.deviceId });
      }
    });
  }

  async connect(config: ToyProviderConfig): Promise<void> {
    const endpoint = config.endpoint ?? '';
    if (!isValidWebSocketEndpoint(endpoint)) throw new Error('连接地址必须以 ws:// 或 wss:// 开头。');
    try { await this.port.connect(endpoint); }
    catch (error) { throw new Error(safeError(error, '无法连接 Intiface。')); }
  }

  async disconnect(): Promise<void> {
    this.selectedDeviceId = null;
    try { await this.port.disconnect(); }
    catch (error) { this.emit({ type: 'error', message: safeError(error, '断开连接时出现问题。') }); }
  }

  async startScanning(): Promise<void> { await this.port.startScanning(); }
  async stopScanning(): Promise<void> { await this.port.stopScanning(); }
  listDevices(): readonly ToyDeviceSummary[] { return this.port.listDevices(); }

  async selectDevice(deviceId: string): Promise<void> {
    const device = this.listDevices().find((item) => item.id === deviceId && item.capabilities.vibrate);
    if (!device) throw new Error('这个设备当前不可用或不支持振动。');
    this.selectedDeviceId = deviceId;
  }

  async vibrate(intensity: number, _durationMs: number, _commandId: string): Promise<void> {
    if (!this.selectedDeviceId) throw new Error('请先选择设备。');
    await this.port.vibrate(this.selectedDeviceId, intensity);
  }

  async stop(): Promise<void> {
    if (!this.selectedDeviceId || !this.port.isConnected()) return;
    await this.port.stop(this.selectedDeviceId);
  }

  isConnected(): boolean { return this.port.isConnected(); }
  dispose(): void { this.unsubscribe(); }
}
