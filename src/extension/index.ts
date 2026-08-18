import { StrictBleProfileCodec } from '../ble-profile/codec';
import type { StoredBleProfile } from '../ble-profile/types';
import { ToyLinkCoordinator } from '../core/coordinator';
import { isLoopbackEndpoint, isValidWebSocketEndpoint, parseSettings, type ToyLinkSettings } from '../core/settings';
import { CustomBleProvider } from '../providers/custom-ble-provider';
import { IntifaceProvider } from '../providers/intiface-provider';
import type { ProviderKind, ToyProvider } from '../providers/toy-provider';
import { ChineseConfirmationService, confirmBlePayload, confirmDangerousSetting, confirmDeleteProfile, confirmNonLoopback } from '../ui/confirm-dialog';
import { ToyLinkSettingsDisclosure } from '../ui/settings-disclosure';
import { ToyLinkEmergencyStopMenu } from '../ui/emergency-stop-menu';
import { ToyLinkPanel, type ToyLinkUiCallbacks } from '../ui/settings-panel';
import { getSillyTavernContext, waitForExtensionSettings, waitForExtensionsMenu, type SillyTavernContext } from './sillytavern';
import { ToyLinkToolCalling } from './tool-calling';

const SETTINGS_KEY = 'toylink';

class ToyLinkExtension {
  private settings: ToyLinkSettings;
  private readonly codec = new StrictBleProfileCodec();
  private readonly coordinator: ToyLinkCoordinator;
  private readonly tools: ToyLinkToolCalling;
  private panel: ToyLinkPanel | null = null;
  private settingsDisclosure: ToyLinkSettingsDisclosure | null = null;
  private emergencyStopMenu: ToyLinkEmergencyStopMenu | null = null;
  private readonly contextHandler = (): void => { void this.coordinator.handleContextChange(); };

  constructor(private readonly context: SillyTavernContext) {
    this.settings = parseSettings(context.extensionSettings[SETTINGS_KEY]);
    const intiface = new IntifaceProvider();
    const bluetooth = new CustomBleProvider(
      (profileId) => this.settings.bleProfiles.find((item) => item.id === profileId),
      undefined,
      undefined,
      confirmBlePayload,
    );
    const providers: Record<ProviderKind, ToyProvider> = { intiface, 'custom-ble': bluetooth };
    this.coordinator = new ToyLinkCoordinator(
      providers,
      this.settings,
      new ChineseConfirmationService(),
      (settings) => this.persist(settings),
    );
    this.tools = new ToyLinkToolCalling(getSillyTavernContext, this.coordinator, () => this.settings);
  }

  async start(): Promise<void> {
    const target = await waitForExtensionSettings();
    this.panel = new ToyLinkPanel(
      this.settings,
      this.createCallbacks(),
      this.tools.isSupported(),
      typeof navigator !== 'undefined' && 'bluetooth' in navigator,
    );
    this.settingsDisclosure = new ToyLinkSettingsDisclosure(this.panel.root);
    target.append(this.settingsDisclosure.root);
    this.coordinator.subscribe((snapshot) => {
      this.panel?.update(snapshot, this.settings);
      this.emergencyStopMenu?.update(snapshot);
    });
    // 魔法棒菜单由 SillyTavern 动态创建；它不可用时不影响完整设置页。
    void this.mountEmergencyStopMenu();
    this.tools.refresh();
    this.bindHostEvents();
    this.saveCurrentSettings();
  }

  shutdown(): void {
    this.emergencyStopMenu?.destroy();
    this.emergencyStopMenu = null;
    this.tools.dispose();
    this.unbindHostEvents();
    this.coordinator.shutdown();
    this.panel?.destroy();
    this.settingsDisclosure?.destroy();
  }

  private async mountEmergencyStopMenu(): Promise<void> {
    try {
      const target = await waitForExtensionsMenu();
      if (this.emergencyStopMenu) return;
      const menu = new ToyLinkEmergencyStopMenu(async () => {
        await this.coordinator.emergencyStop('你已点击“立即停止”。');
      });
      this.emergencyStopMenu = menu;
      target.append(menu.button);
      menu.update(this.coordinator.snapshot());
    } catch (error) {
      console.warn('[ToyLink] 未能把“立即停止”加入魔法棒菜单。', error instanceof Error ? error.message : '未知错误');
    }
  }

  private createCallbacks(): ToyLinkUiCallbacks {
    return {
      changeProvider: async (kind) => this.coordinator.changeProvider(kind),
      saveEndpoint: (endpoint) => this.saveEndpoint(endpoint),
      connect: async () => this.connect(),
      disconnect: async () => this.coordinator.disconnect(),
      startScanning: async () => this.coordinator.startScanning(),
      stopScanning: async () => this.coordinator.stopScanning(),
      refreshDevices: () => this.coordinator.refreshDevices(),
      selectDevice: async (id) => this.coordinator.selectDevice(id),
      runTest: async (intensity, durationMs) => {
        await this.coordinator.execute({
          action: 'vibrate', intensity, durationMs,
          commandId: `manual-test-${Date.now()}-${crypto.randomUUID()}`,
          createdAt: Date.now(),
        }, 'manual');
      },
      emergencyStop: async () => this.coordinator.emergencyStop('你已点击“立即停止”。'),
      setAiAuthorized: (enabled) => this.coordinator.setAiAuthorized(enabled),
      setConfirmationEnabled: async (enabled) => this.setConfirmationEnabled(enabled),
      setLimits: (maxIntensity, maxDurationMs) => {
        this.coordinator.setLimits({ maxIntensity, maxDurationMs });
        this.tools.refresh();
      },
      saveBleProfile: async (json) => this.saveBleProfile(json, false),
      importBleProfile: async (file) => this.importBleProfile(file),
      exportBleProfile: () => this.exportBleProfile(),
      deleteBleProfile: async () => this.deleteBleProfile(),
      selectBleProfile: async (id) => this.selectBleProfile(id),
    };
  }

  private async connect(): Promise<void> {
    if (this.settings.providerKind === 'intiface') {
      const endpoint = this.settings.intifaceEndpoint;
      if (!isValidWebSocketEndpoint(endpoint)) {
        this.coordinator.reportError('连接地址必须以 ws:// 或 wss:// 开头。');
        throw new Error('无效连接地址');
      }
      if (!isLoopbackEndpoint(endpoint) && !(await confirmNonLoopback(endpoint))) {
        this.coordinator.reportStatus('你取消了连接。');
        return;
      }
      if (location.protocol === 'https:' && endpoint.startsWith('ws://')) {
        this.coordinator.reportStatus('当前页面使用 HTTPS，浏览器可能会拦截 ws:// 连接；ToyLink 不会绕过浏览器安全检查。');
      }
      await this.coordinator.connect({ endpoint });
    } else {
      const bleProfileId = this.settings.selectedBleProfileId;
      if (!bleProfileId) {
        this.coordinator.reportError('请先选择一个蓝牙配置。');
        throw new Error('尚未选择蓝牙配置');
      }
      await this.coordinator.connect({ bleProfileId });
    }
  }

  private saveEndpoint(endpoint: string): void {
    if (!isValidWebSocketEndpoint(endpoint)) {
      this.coordinator.reportError('连接地址必须以 ws:// 或 wss:// 开头，且不能包含账号密码。');
      return;
    }
    this.coordinator.updateStoredSettings((settings) => { settings.intifaceEndpoint = endpoint; });
    this.coordinator.reportStatus('Intiface 地址已保存。');
  }

  private async setConfirmationEnabled(enabled: boolean): Promise<boolean> {
    if (!enabled && !(await confirmDangerousSetting())) return false;
    this.coordinator.setConfirmationEnabled(enabled);
    this.coordinator.reportStatus(enabled ? '每次操作前都会询问你。' : '已关闭逐次确认；安全上限和立即停止仍然有效。');
    return true;
  }

  private async saveBleProfile(json: string, forceNew: boolean): Promise<void> {
    let parsed: unknown;
    try { parsed = JSON.parse(json); }
    catch { this.coordinator.reportError('JSON 格式不正确，请检查逗号、引号和括号。'); throw new Error('JSON 格式不正确'); }
    let profile;
    try { profile = this.codec.validate(parsed); }
    catch (error) { this.coordinator.reportError(error instanceof Error ? error.message : '蓝牙配置无效。'); throw error; }
    const selectedId = forceNew ? null : this.settings.selectedBleProfileId;
    const id = selectedId ?? `profile-${crypto.randomUUID()}`;
    this.coordinator.updateStoredSettings((settings) => {
      const stored: StoredBleProfile = { id, profile };
      const index = settings.bleProfiles.findIndex((item) => item.id === id);
      if (index >= 0) settings.bleProfiles[index] = stored;
      else settings.bleProfiles.push(stored);
      settings.selectedBleProfileId = id;
    });
    this.coordinator.reportStatus(`蓝牙配置“${profile.name}”已经检查并保存。`);
  }

  private async importBleProfile(file: File): Promise<void> {
    if (file.size > 128 * 1024) {
      this.coordinator.reportError('配置文件过大，最大允许 128 KB。');
      throw new Error('配置文件过大');
    }
    await this.saveBleProfile(await file.text(), true);
  }

  private exportBleProfile(): void {
    const selected = this.settings.bleProfiles.find((item) => item.id === this.settings.selectedBleProfileId);
    if (!selected) { this.coordinator.reportError('请先选择要导出的蓝牙配置。'); return; }
    const blob = new Blob([JSON.stringify(selected.profile, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selected.profile.name.replaceAll(/[^\p{L}\p{N}._-]+/gu, '_').slice(0, 60) || 'toylink-profile'}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    this.coordinator.reportStatus('蓝牙配置已导出到浏览器下载目录。');
  }

  private async deleteBleProfile(): Promise<void> {
    const selected = this.settings.bleProfiles.find((item) => item.id === this.settings.selectedBleProfileId);
    if (!selected) { this.coordinator.reportError('请先选择要删除的蓝牙配置。'); return; }
    if (!(await confirmDeleteProfile(selected.profile.name))) return;
    if (this.settings.providerKind === 'custom-ble') await this.coordinator.disconnect();
    this.coordinator.updateStoredSettings((settings) => {
      settings.bleProfiles = settings.bleProfiles.filter((item) => item.id !== selected.id);
      settings.selectedBleProfileId = null;
    });
    this.coordinator.reportStatus('蓝牙配置已删除。');
  }

  private async selectBleProfile(id: string | null): Promise<void> {
    if (id === this.settings.selectedBleProfileId) return;
    if (this.settings.providerKind === 'custom-ble' && this.coordinator.snapshot().connected) await this.coordinator.disconnect();
    this.coordinator.updateStoredSettings((settings) => { settings.selectedBleProfileId = id; });
    this.coordinator.reportStatus(id ? '已选择蓝牙配置，请重新连接设备。' : '尚未选择蓝牙配置。');
  }

  private persist(settings: ToyLinkSettings): void {
    this.settings = structuredClone(settings);
    this.saveCurrentSettings();
    this.panel?.update(this.coordinator.snapshot(), this.settings);
  }

  private saveCurrentSettings(): void {
    this.context.extensionSettings[SETTINGS_KEY] = structuredClone(this.settings);
    this.context.saveSettingsDebounced();
  }

  private bindHostEvents(): void {
    const chatChanged = this.context.event_types?.CHAT_CHANGED;
    if (chatChanged) this.context.eventSource?.on(chatChanged, this.contextHandler);
    window.addEventListener('pagehide', this.contextHandler);
    window.addEventListener('beforeunload', this.contextHandler);
  }

  private unbindHostEvents(): void {
    const chatChanged = this.context.event_types?.CHAT_CHANGED;
    if (chatChanged) this.context.eventSource?.off?.(chatChanged, this.contextHandler);
    window.removeEventListener('pagehide', this.contextHandler);
    window.removeEventListener('beforeunload', this.contextHandler);
  }
}

let extension: ToyLinkExtension | null = null;

async function initialize(): Promise<void> {
  if (extension) return;
  const context = getSillyTavernContext();
  if (!context) {
    console.error('[ToyLink] 无法获取 SillyTavern 扩展接口。');
    return;
  }
  extension = new ToyLinkExtension(context);
  try { await extension.start(); }
  catch (error) {
    console.error('[ToyLink] 初始化失败：', error instanceof Error ? error.message : '未知错误');
    extension = null;
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { void initialize(); }, { once: true });
else void initialize();
