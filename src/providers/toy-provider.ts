export type ProviderKind = 'intiface' | 'custom-ble';

export type ToyFeatureType =
  | 'vibrate'
  | 'rotate'
  | 'linear'
  | 'oscillate'
  | 'constrict'
  | 'unknown';

export interface ToyFeature {
  readonly id: string;
  readonly type: ToyFeatureType;
  readonly label: string;
  readonly actuatorIndex: number;
  readonly supported: boolean;
  readonly stepCount?: number;
  readonly supportsDirection?: boolean;
}

export interface ToyDeviceCapabilities {
  readonly vibrate: boolean;
  /** 设备能力摘要；底层连接对象必须留在 provider 内部。 */
  readonly features?: readonly ToyFeature[];
  readonly canStop?: boolean;
}

export interface ToyDeviceSummary {
  id: string;
  name: string;
  capabilities: ToyDeviceCapabilities;
}

export function getToyFeatures(device: ToyDeviceSummary): readonly ToyFeature[] {
  if (device.capabilities.features && device.capabilities.features.length > 0) return device.capabilities.features;
  return device.capabilities.vibrate
    ? [{ id: 'vibrate', type: 'vibrate', label: '振动', actuatorIndex: 0, supported: true }]
    : [];
}

export function hasSupportedFeature(device: ToyDeviceSummary, featureId = 'vibrate'): boolean {
  return getToyFeatures(device).some((feature) => feature.id === featureId && feature.supported);
}

export type ToyProviderEvent =
  | { type: 'connection'; connected: boolean; message?: string }
  | { type: 'scanning'; scanning: boolean; message?: string }
  | { type: 'devices-changed'; devices: readonly ToyDeviceSummary[] }
  | { type: 'device-removed'; deviceId: string }
  | { type: 'error'; message: string };

export interface ToyProviderConfig {
  endpoint?: string;
  bleProfileId?: string;
}

export interface ToyProvider {
  readonly kind: ProviderKind;
  connect(config: ToyProviderConfig): Promise<void>;
  disconnect(): Promise<void>;
  startScanning(): Promise<void>;
  stopScanning(): Promise<void>;
  listDevices(): readonly ToyDeviceSummary[];
  selectDevice(deviceId: string): Promise<void>;
  vibrate(intensity: number, durationMs: number, commandId: string): Promise<void>;
  stop(): Promise<void>;
  /** 取消 provider 内部正在等待的确认或选择窗口。 */
  cancelPending?(): void;
  isConnected(): boolean;
  subscribe(listener: (event: ToyProviderEvent) => void): () => void;
}

export abstract class EventedToyProvider implements ToyProvider {
  abstract readonly kind: ProviderKind;
  private readonly listeners = new Set<(event: ToyProviderEvent) => void>();

  abstract connect(config: ToyProviderConfig): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract startScanning(): Promise<void>;
  abstract stopScanning(): Promise<void>;
  abstract listDevices(): readonly ToyDeviceSummary[];
  abstract selectDevice(deviceId: string): Promise<void>;
  abstract vibrate(intensity: number, durationMs: number, commandId: string): Promise<void>;
  abstract stop(): Promise<void>;
  abstract isConnected(): boolean;

  subscribe(listener: (event: ToyProviderEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  protected emit(event: ToyProviderEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
