export type ProviderKind = 'intiface' | 'custom-ble';

export interface ToyDeviceSummary {
  id: string;
  name: string;
  capabilities: { vibrate: boolean };
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
