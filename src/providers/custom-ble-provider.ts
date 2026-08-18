import { bytesToHex, getBleConnection, StrictBleProfileCodec } from '../ble-profile/codec';
import type { BleProfile, BleWriteType, StoredBleProfile } from '../ble-profile/types';
import type { ToyDeviceSummary, ToyProviderConfig } from './toy-provider';
import { EventedToyProvider } from './toy-provider';

export interface WebBluetoothPort {
  isSupported(): boolean;
  requestAndConnect(profile: BleProfile): Promise<{ name: string }>;
  write(payload: Uint8Array, writeType: BleWriteType): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  onDisconnected(listener: () => void): () => void;
}

export class BrowserWebBluetoothPort implements WebBluetoothPort {
  private device: BluetoothDevice | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private readonly disconnectListeners = new Set<() => void>();
  private readonly disconnectHandler = (): void => {
    this.characteristic = null;
    for (const listener of this.disconnectListeners) listener();
  };

  isSupported(): boolean { return typeof navigator !== 'undefined' && 'bluetooth' in navigator; }

  async requestAndConnect(profile: BleProfile): Promise<{ name: string }> {
    if (!this.isSupported()) throw new Error('当前浏览器不支持直接连接蓝牙设备。请使用支持 Web Bluetooth 的浏览器。');
    await this.disconnect();
    const connection = getBleConnection(profile);
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: connection.deviceNamePrefix }],
      optionalServices: [connection.serviceUuid],
    });
    const gatt = device.gatt;
    if (!gatt) throw new Error('浏览器没有提供这个设备的连接功能。');
    device.addEventListener('gattserverdisconnected', this.disconnectHandler);
    this.device = device;
    const server = await gatt.connect();
    const service = await server.getPrimaryService(connection.serviceUuid);
    this.characteristic = await service.getCharacteristic(connection.writeCharacteristicUuid);
    return { name: device.name?.trim() || '未命名蓝牙设备' };
  }

  async write(payload: Uint8Array, writeType: BleWriteType): Promise<void> {
    const characteristic = this.characteristic;
    if (!characteristic || !this.isConnected()) throw new Error('蓝牙设备已经断开。');
    const copy = new Uint8Array(payload);
    if (writeType === 'with-response') await characteristic.writeValueWithResponse(copy);
    else await characteristic.writeValueWithoutResponse(copy);
  }

  async disconnect(): Promise<void> {
    const device = this.device;
    this.device = null;
    this.characteristic = null;
    if (device) {
      device.removeEventListener('gattserverdisconnected', this.disconnectHandler);
      if (device.gatt?.connected) device.gatt.disconnect();
    }
  }

  isConnected(): boolean { return this.device?.gatt?.connected === true && this.characteristic !== null; }

  onDisconnected(listener: () => void): () => void {
    this.disconnectListeners.add(listener);
    return () => this.disconnectListeners.delete(listener);
  }
}

export type BleProfileResolver = (profileId: string) => StoredBleProfile | undefined;
export type PayloadPreviewConfirmation = (details: { profileName: string; payloadHex: string }) => Promise<boolean>;

function safeError(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    const message = error.message.trim();
    if (message && /[\u3400-\u9fff]/u.test(message) && !/wss?:\/\//i.test(message)) return message.slice(0, 200);
  }
  return fallback;
}

export class CustomBleProvider extends EventedToyProvider {
  readonly kind = 'custom-ble' as const;
  private active: StoredBleProfile | null = null;
  private device: ToyDeviceSummary | null = null;
  private selectedDeviceId: string | null = null;
  private requestGeneration = 0;
  private readonly confirmedProfiles = new Set<string>();
  private confirmationGeneration = 0;
  private readonly unsubscribeDisconnected: () => void;

  constructor(
    private readonly resolveProfile: BleProfileResolver,
    private readonly port: WebBluetoothPort = new BrowserWebBluetoothPort(),
    private readonly codec = new StrictBleProfileCodec(),
    private readonly confirmPayload: PayloadPreviewConfirmation = async () => true,
  ) {
    super();
    this.unsubscribeDisconnected = this.port.onDisconnected(() => {
      this.confirmationGeneration += 1;
      this.requestGeneration += 1;
      const removed = this.device?.id;
      this.device = null;
      this.selectedDeviceId = null;
      this.emit({ type: 'connection', connected: false, message: '蓝牙设备已断开。' });
      if (removed) this.emit({ type: 'device-removed', deviceId: removed });
      this.emit({ type: 'devices-changed', devices: [] });
    });
  }

  async connect(config: ToyProviderConfig): Promise<void> {
    this.confirmationGeneration += 1;
    const profileId = config.bleProfileId;
    if (!profileId) throw new Error('请先选择一份蓝牙配置。');
    const stored = this.resolveProfile(profileId);
    if (!stored) throw new Error('\u627e\u4e0d\u5230\u6240\u9009\u7684\u84dd\u7259\u914d\u7f6e\u3002');
    this.active = { id: stored.id, profile: this.codec.validate(stored.profile) };
    this.requestGeneration += 1;
    this.emit({ type: 'scanning', scanning: false, message: '蓝牙配置已启用，请点击“开始查找”打开系统设备选择窗口。' });
  }

  async disconnect(): Promise<void> {
    this.requestGeneration += 1;
    this.confirmationGeneration += 1;
    this.device = null;
    this.selectedDeviceId = null;
    await this.port.disconnect();
    this.emit({ type: 'connection', connected: false });
    this.emit({ type: 'devices-changed', devices: [] });
  }

  async startScanning(): Promise<void> {
    if (!this.active) throw new Error('请先选择并启用一份蓝牙配置。');
    await this.requestDevice();
  }

  async stopScanning(): Promise<void> {
    this.requestGeneration += 1;
    this.emit({ type: 'scanning', scanning: false, message: '已取消查找；如果系统窗口仍然打开，请手动关闭。' });
  }

  listDevices(): readonly ToyDeviceSummary[] { return this.device ? [this.device] : []; }

  async selectDevice(deviceId: string): Promise<void> {
    if (!this.device || this.device.id !== deviceId || !this.port.isConnected()) throw new Error('这个蓝牙设备当前不可用。');
    this.selectedDeviceId = deviceId;
  }

  async vibrate(intensity: number, _durationMs: number, _commandId: string): Promise<void> {
    const confirmationGeneration = this.confirmationGeneration;
    const active = this.active;
    if (!active || !this.selectedDeviceId || !this.port.isConnected()) throw new Error('请先连接并选择蓝牙设备。');
    const payload = this.codec.encodeVibrate(active.profile, intensity);
    if (!this.confirmedProfiles.has(active.id)) {
      const allowed = await this.confirmPayload({ profileName: active.profile.name, payloadHex: bytesToHex(payload) });
      if (!allowed) throw new Error('你取消了第一次蓝牙测试。');
      if (confirmationGeneration !== this.confirmationGeneration) throw new Error('\u8fd9\u6b21\u64cd\u4f5c\u5df2\u88ab\u505c\u6b62\u3002');
      this.confirmedProfiles.add(active.id);
    }
    if (this.active?.id !== active.id || !this.selectedDeviceId || !this.port.isConnected()) {
      throw new Error('\u84dd\u7259\u8bbe\u5907\u5df2\u7ecf\u65ad\u5f00\uff0c\u672a\u53d1\u9001\u8fd9\u6b21\u64cd\u4f5c\u3002');
    }
    await this.port.write(payload, getBleConnection(active.profile).writeType);
  }

  async stop(): Promise<void> {
    this.confirmationGeneration += 1;
    const active = this.active;
    if (!active || !this.port.isConnected()) return;
    await this.port.write(this.codec.encodeStop(active.profile), getBleConnection(active.profile).writeType);
  }

  cancelPending(): void { this.confirmationGeneration += 1; }
  isConnected(): boolean { return this.port.isConnected(); }
  isSupported(): boolean { return this.port.isSupported(); }
  dispose(): void { this.unsubscribeDisconnected(); }

  private async requestDevice(): Promise<void> {
    const active = this.active;
    if (!active) throw new Error('请先选择一份蓝牙配置。');
    if (!this.port.isSupported()) throw new Error('当前浏览器不支持直接连接蓝牙设备。');
    const generation = ++this.requestGeneration;
    this.emit({ type: 'scanning', scanning: true, message: '请在系统窗口中选择你的设备。' });
    try {
      const result = await this.port.requestAndConnect(active.profile);
      if (generation !== this.requestGeneration) {
        await this.port.disconnect();
        return;
      }
      const id = `ble-session-${crypto.randomUUID()}`;
      this.device = { id, name: result.name, capabilities: { vibrate: true, canStop: true, features: [{ id: 'vibrate', type: 'vibrate', label: '\u632f\u52a8', actuatorIndex: 0, supported: true }] } };
      this.selectedDeviceId = null;
      this.emit({ type: 'connection', connected: true });
      this.emit({ type: 'devices-changed', devices: [this.device] });
    } catch (error) {
      this.device = null;
      this.selectedDeviceId = null;
      this.emit({ type: 'connection', connected: false });
      throw new Error(safeError(error, '无法连接蓝牙设备。'));
    } finally {
      if (generation === this.requestGeneration) this.emit({ type: 'scanning', scanning: false });
    }
  }
}
