import { parseToyCommand } from './command-schema';
import type { AppliedVibration, CommandOrigin, ToyCommand } from './commands';
import { STOP_RETRY_COUNT, TEST_MAX_DURATION_MS, TEST_MAX_INTENSITY, WATCHDOG_GRACE_MS } from './constants';
import { applySafetyLimits, normalizeLimits, type SafetyLimits } from './safety-controller';
import type { ToyLinkSettings } from './settings';
import type { ProviderKind, ToyDeviceSummary, ToyProvider, ToyProviderEvent } from '../providers/toy-provider';

export interface ConfirmationRequest {
  origin: CommandOrigin;
  requested: { intensity: number; durationMs: number };
  applied: AppliedVibration;
}

export interface ConfirmationService {
  confirmVibration(request: ConfirmationRequest): Promise<boolean>;
}

export interface TimerPort {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const browserTimerPort: TimerPort = {
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface CoordinatorSnapshot {
  providerKind: ProviderKind;
  connected: boolean;
  scanning: boolean;
  devices: readonly ToyDeviceSummary[];
  selectedDeviceId: string | null;
  aiAuthorized: boolean;
  active: boolean;
  status: string;
  error: string | null;
  limits: SafetyLimits;
  confirmationEnabled: boolean;
}

export interface SanitizedStatus {
  connected: boolean;
  deviceSelected: boolean;
  vibrationAvailable: boolean;
  aiAuthorized: boolean;
  active: boolean;
}

function safeMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    const message = error.message.trim();
    if (message && /[\u3400-\u9fff]/u.test(message) && !/wss?:\/\//i.test(message)) return message.slice(0, 200);
  }
  return fallback;
}

export class ToyLinkCoordinator {
  private settings: ToyLinkSettings;
  private provider: ToyProvider;
  private unsubscribeProvider: () => void;
  private readonly listeners = new Set<(snapshot: CoordinatorSnapshot) => void>();
  private readonly seenCommands = new Map<string, number>();
  private selectedDeviceId: string | null = null;
  private connected = false;
  private scanning = false;
  private devices: readonly ToyDeviceSummary[] = [];
  private aiAuthorized = false;
  private activeCommandId: string | null = null;
  private expiryTimer: unknown = null;
  private watchdogTimer: unknown = null;
  private status = '尚未连接设备。';
  private error: string | null = null;

  constructor(
    private readonly providers: Readonly<Record<ProviderKind, ToyProvider>>,
    initialSettings: ToyLinkSettings,
    private readonly confirmation: ConfirmationService,
    private readonly onSettingsChanged: (settings: ToyLinkSettings) => void,
    private readonly timer: TimerPort = browserTimerPort,
    private readonly now: () => number = () => Date.now(),
  ) {
    this.settings = structuredClone(initialSettings);
    this.provider = providers[this.settings.providerKind];
    this.unsubscribeProvider = this.provider.subscribe((event) => this.handleProviderEvent(event));
  }

  subscribe(listener: (snapshot: CoordinatorSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  snapshot(): CoordinatorSnapshot {
    return {
      providerKind: this.settings.providerKind,
      connected: this.connected,
      scanning: this.scanning,
      devices: this.devices.map((device) => ({ ...device, capabilities: { ...device.capabilities } })),
      selectedDeviceId: this.selectedDeviceId,
      aiAuthorized: this.aiAuthorized,
      active: this.activeCommandId !== null,
      status: this.status,
      error: this.error,
      limits: { ...this.settings.limits },
      confirmationEnabled: this.settings.confirmationEnabled,
    };
  }

  getSettings(): ToyLinkSettings { return structuredClone(this.settings); }

  getSanitizedStatus(): SanitizedStatus {
    const selected = this.devices.find((device) => device.id === this.selectedDeviceId);
    return {
      connected: this.connected,
      deviceSelected: selected !== undefined,
      vibrationAvailable: selected?.capabilities.vibrate === true,
      aiAuthorized: this.aiAuthorized,
      active: this.activeCommandId !== null,
    };
  }

  async changeProvider(kind: ProviderKind): Promise<void> {
    if (kind === this.settings.providerKind) return;
    await this.emergencyStop('正在切换连接方式。');
    await this.provider.disconnect();
    this.unsubscribeProvider();
    this.settings.providerKind = kind;
    this.provider = this.providers[kind];
    this.unsubscribeProvider = this.provider.subscribe((event) => this.handleProviderEvent(event));
    this.resetRuntime('已切换连接方式，请重新连接并选择设备。');
    this.persist();
  }

  async connect(config: { endpoint?: string; bleProfileId?: string }): Promise<void> {
    this.clearError();
    try {
      await this.provider.connect(config);
      this.connected = this.provider.isConnected();
      this.devices = this.provider.listDevices();
      this.status = this.connected ? '连接成功，请明确选择要使用的设备。' : '正在等待设备连接。';
    } catch (error) {
      this.error = safeMessage(error, '连接失败。');
      this.status = '未能连接。';
      throw error;
    } finally { this.emit(); }
  }

  async disconnect(): Promise<void> {
    await this.emergencyStop('正在断开连接。');
    await this.provider.disconnect();
    this.resetRuntime('已断开连接。');
  }

  async startScanning(): Promise<void> {
    this.clearError();
    try { await this.provider.startScanning(); }
    catch (error) { this.error = safeMessage(error, '无法查找设备。'); throw error; }
    finally { this.emit(); }
  }

  async stopScanning(): Promise<void> {
    try { await this.provider.stopScanning(); }
    catch (error) { this.error = safeMessage(error, '停止查找时出现问题。'); throw error; }
    finally { this.emit(); }
  }

  refreshDevices(): void {
    this.devices = this.provider.listDevices();
    if (this.selectedDeviceId && !this.devices.some((device) => device.id === this.selectedDeviceId)) {
      void this.emergencyStop('原先选择的设备已经不可用。');
      this.selectedDeviceId = null;
    }
    this.status = this.devices.length > 0 ? `找到 ${this.devices.length} 个可用设备。` : '暂时没有找到可用设备。';
    this.emit();
  }

  async selectDevice(deviceId: string): Promise<void> {
    if (deviceId === this.selectedDeviceId) return;
    await this.emergencyStop('正在更换设备。');
    await this.provider.selectDevice(deviceId);
    this.selectedDeviceId = deviceId;
    this.aiAuthorized = false;
    this.status = '设备已选择，可以先进行低强度测试。';
    this.error = null;
    this.emit();
  }

  setAiAuthorized(enabled: boolean): void {
    if (!enabled) void this.emergencyStop('角色控制已关闭。');
    this.aiAuthorized = enabled;
    this.status = enabled ? '角色控制已开启，仅在当前聊天和本次页面会话中有效。' : '角色控制已关闭。';
    this.emit();
  }

  reportStatus(message: string): void {
    this.status = message.slice(0, 240);
    this.error = null;
    this.emit();
  }

  reportError(message: string): void {
    this.error = message.slice(0, 240);
    this.emit();
  }

  setConfirmationEnabled(enabled: boolean): void {
    this.settings.confirmationEnabled = enabled;
    this.persist();
  }

  setLimits(limits: SafetyLimits): void {
    this.settings.limits = normalizeLimits(limits);
    this.persist();
  }

  updateStoredSettings(update: (settings: ToyLinkSettings) => void): void {
    update(this.settings);
    this.persist();
  }

  async execute(input: unknown, origin: CommandOrigin): Promise<AppliedVibration | null> {
    const command = parseToyCommand(input, this.now());
    this.pruneSeenCommands();
    if (this.seenCommands.has(command.commandId)) throw new Error('这个请求已经处理过。');
    this.seenCommands.set(command.commandId, command.createdAt);
    if (command.action === 'stop') {
      await this.emergencyStop(origin === 'ai' ? '角色请求停止。' : '已停止。');
      return null;
    }
    return this.executeVibration(command, origin);
  }

  async emergencyStop(reason = '已立即停止。'): Promise<void> {
    this.clearTimers();
    this.activeCommandId = null;
    let lastError: unknown = null;
    for (let attempt = 0; attempt <= STOP_RETRY_COUNT; attempt += 1) {
      try {
        await this.provider.stop();
        this.status = reason;
        this.error = null;
        this.emit();
        return;
      } catch (error) { lastError = error; }
    }
    this.status = '无法确认设备已经停止。';
    this.error = `请立即使用设备自身的停止方式。${safeMessage(lastError, '')}`.slice(0, 240);
    this.emit();
  }

  async handleContextChange(): Promise<void> {
    this.aiAuthorized = false;
    await this.emergencyStop('聊天或角色已经切换，角色控制已关闭。');
  }

  shutdown(): void {
    this.aiAuthorized = false;
    this.clearTimers();
    void this.provider.stop().catch(() => undefined);
    void this.provider.disconnect().catch(() => undefined);
    this.unsubscribeProvider();
  }

  private async executeVibration(command: Extract<ToyCommand, { action: 'vibrate' }>, origin: CommandOrigin): Promise<AppliedVibration> {
    const selected = this.devices.find((device) => device.id === this.selectedDeviceId);
    if (!this.provider.isConnected() || !this.connected) throw new Error('请先连接设备。');
    if (!selected) throw new Error('请先明确选择要使用的设备。');
    if (!selected.capabilities.vibrate) throw new Error('所选设备不支持这项操作。');
    if (origin === 'ai' && !this.aiAuthorized) throw new Error('你还没有允许角色控制设备。');
    const limits = origin === 'manual'
      ? {
        maxIntensity: Math.min(this.settings.limits.maxIntensity, TEST_MAX_INTENSITY),
        maxDurationMs: Math.min(this.settings.limits.maxDurationMs, TEST_MAX_DURATION_MS),
      }
      : this.settings.limits;
    const applied = applySafetyLimits(command.intensity, command.durationMs, limits);
    if (this.settings.confirmationEnabled) {
      const confirmed = await this.confirmation.confirmVibration({
        origin,
        requested: { intensity: command.intensity, durationMs: command.durationMs },
        applied,
      });
      if (!confirmed) throw new Error('你取消了这次操作。');
    }
    await this.emergencyStop('正在准备新的操作。');
    this.activeCommandId = command.commandId;
    this.status = `设备将运行 ${(applied.durationMs / 1000).toFixed(1)} 秒，强度 ${Math.round(applied.intensity * 100)}%。`;
    this.error = null;
    const id = command.commandId;
    this.expiryTimer = this.timer.setTimeout(() => { if (this.activeCommandId === id) void this.emergencyStop('已按设定时间自动停止。'); }, applied.durationMs);
    this.watchdogTimer = this.timer.setTimeout(() => { if (this.activeCommandId === id) void this.emergencyStop('安全保护已触发停止。'); }, applied.durationMs + WATCHDOG_GRACE_MS);
    this.emit();
    try {
      await this.provider.vibrate(applied.intensity, applied.durationMs, command.commandId);
      return applied;
    } catch (error) {
      await this.emergencyStop('执行过程中出现问题，已尝试停止。');
      this.error = safeMessage(error, '设备没有成功执行。');
      this.emit();
      throw error;
    }
  }

  private handleProviderEvent(event: ToyProviderEvent): void {
    if (event.type === 'connection') {
      this.connected = event.connected;
      if (!event.connected) {
        this.aiAuthorized = false;
        this.selectedDeviceId = null;
        this.devices = [];
        void this.emergencyStop(event.message ?? '连接已断开，角色控制已关闭。');
      }
    } else if (event.type === 'scanning') {
      this.scanning = event.scanning;
      if (event.message) this.status = event.message;
    } else if (event.type === 'devices-changed') {
      this.devices = event.devices;
      if (this.selectedDeviceId && !event.devices.some((device) => device.id === this.selectedDeviceId)) {
        this.selectedDeviceId = null;
        this.aiAuthorized = false;
        void this.emergencyStop('所选设备已经不可用，角色控制已关闭。');
      }
    } else if (event.type === 'device-removed') {
      if (event.deviceId === this.selectedDeviceId) {
        this.selectedDeviceId = null;
        this.aiAuthorized = false;
        void this.emergencyStop('所选设备已经断开，角色控制已关闭。');
      }
    } else {
      this.error = event.message;
    }
    this.emit();
  }

  private resetRuntime(status: string): void {
    this.connected = false;
    this.scanning = false;
    this.devices = [];
    this.selectedDeviceId = null;
    this.aiAuthorized = false;
    this.activeCommandId = null;
    this.status = status;
    this.error = null;
    this.clearTimers();
    this.emit();
  }

  private clearTimers(): void {
    if (this.expiryTimer !== null) this.timer.clearTimeout(this.expiryTimer);
    if (this.watchdogTimer !== null) this.timer.clearTimeout(this.watchdogTimer);
    this.expiryTimer = null;
    this.watchdogTimer = null;
  }

  private clearError(): void { this.error = null; }

  private pruneSeenCommands(): void {
    const cutoff = this.now() - 60_000;
    for (const [id, timestamp] of this.seenCommands) if (timestamp < cutoff) this.seenCommands.delete(id);
  }

  private persist(): void {
    this.onSettingsChanged(structuredClone(this.settings));
    this.emit();
  }

  private emit(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}
