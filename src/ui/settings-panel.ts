import type { CoordinatorSnapshot } from '../core/coordinator';
import {
  ABSOLUTE_MAX_DURATION_MS,
  ABSOLUTE_MAX_INTENSITY,
  TEST_DEFAULT_DURATION_MS,
  TEST_DEFAULT_INTENSITY,
  TEST_MAX_DURATION_MS,
  TEST_MAX_INTENSITY,
} from '../core/constants';
import type { ToyLinkSettings } from '../core/settings';
import type { ProviderKind } from '../providers/toy-provider';

export interface ToyLinkUiCallbacks {
  changeProvider(kind: ProviderKind): Promise<void>;
  saveEndpoint(endpoint: string): void;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  startScanning(): Promise<void>;
  stopScanning(): Promise<void>;
  refreshDevices(): void;
  selectDevice(deviceId: string): Promise<void>;
  runTest(intensity: number, durationMs: number): Promise<void>;
  emergencyStop(): Promise<void>;
  setAiAuthorized(enabled: boolean): void;
  setConfirmationEnabled(enabled: boolean): Promise<boolean>;
  setLimits(maxIntensity: number, maxDurationMs: number): void;
  saveBleProfile(json: string): Promise<void>;
  importBleProfile(file: File): Promise<void>;
  exportBleProfile(): void;
  deleteBleProfile(): Promise<void>;
  selectBleProfile(id: string | null): Promise<void>;
}

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const value = document.createElement(tag);
  if (className) value.className = className;
  if (text !== undefined) value.textContent = text;
  return value;
}

function button(text: string): HTMLButtonElement {
  const value = node('button', 'menu_button', text);
  value.type = 'button';
  return value;
}

function labeled(labelText: string, control: HTMLElement, hint?: string): HTMLLabelElement {
  const label = node('label', 'toylink-field');
  label.append(node('span', 'toylink-label', labelText), control);
  if (hint) label.append(node('small', 'toylink-hint', hint));
  return label;
}

function step(number: number, title: string): HTMLElement {
  const header = node('div', 'toylink-step-title');
  header.append(node('span', 'toylink-step-number', String(number)), node('h4', '', title));
  return header;
}

export class ToyLinkPanel {
  readonly root = node('section', 'toylink-panel');
  private settings: ToyLinkSettings;
  private snapshot: CoordinatorSnapshot | null = null;
  private readonly status = node('div', 'toylink-status', '正在初始化…');
  private readonly error = node('div', 'toylink-error');
  private readonly providerSelect = node('select') as HTMLSelectElement;
  private readonly endpointInput = node('input') as HTMLInputElement;
  private readonly bleSection = node('div', 'toylink-ble-section');
  private readonly intifaceSection = node('div', 'toylink-intiface-section');
  private readonly profileSelect = node('select') as HTMLSelectElement;
  private readonly profileEditor = node('textarea') as HTMLTextAreaElement;
  private readonly deviceSelect = node('select') as HTMLSelectElement;
  private readonly connectButton = button('连接');
  private readonly disconnectButton = button('断开');
  private readonly scanButton = button('开始查找');
  private readonly stopScanButton = button('停止查找');
  private readonly selectDeviceButton = button('使用这个设备');
  private readonly testIntensity = node('input') as HTMLInputElement;
  private readonly testDuration = node('input') as HTMLInputElement;
  private readonly aiToggle = node('input') as HTMLInputElement;
  private readonly confirmToggle = node('input') as HTMLInputElement;
  private readonly maxIntensity = node('input') as HTMLInputElement;
  private readonly maxDuration = node('input') as HTMLInputElement;
  private readonly floatingStop = button('立即停止');
  private readonly toolSupport = node('p', 'toylink-hint');

  constructor(
    settings: ToyLinkSettings,
    private readonly callbacks: ToyLinkUiCallbacks,
    toolCallingSupported: boolean,
    bluetoothSupported: boolean,
  ) {
    this.settings = structuredClone(settings);
    this.root.id = 'toylink-settings';
    this.root.append(node('h3', '', 'ToyLink 设备连接'));
    this.root.append(node('p', 'toylink-intro', '只有你明确允许后，角色才能在你的安全上限内请求设备运行。所有设备操作都发生在当前浏览器附近。'));
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    this.error.setAttribute('role', 'alert');
    this.root.append(this.status, this.error);

    this.buildProviderStep();
    this.buildConnectionStep(bluetoothSupported);
    this.buildDeviceStep();
    this.buildTestStep();
    this.buildAiStep(toolCallingSupported);
    this.buildLimitsStep();
    this.buildDetails();

    this.floatingStop.className = 'toylink-emergency-stop';
    this.floatingStop.setAttribute('aria-label', '立即停止 ToyLink 设备');
    this.floatingStop.addEventListener('click', () => { void this.run(() => this.callbacks.emergencyStop()); });
    document.body.append(this.floatingStop);
    this.renderSettings();
  }

  update(snapshot: CoordinatorSnapshot, settings: ToyLinkSettings): void {
    this.snapshot = snapshot;
    this.settings = structuredClone(settings);
    this.status.textContent = snapshot.status;
    this.error.textContent = snapshot.error ?? '';
    this.error.hidden = snapshot.error === null;
    this.providerSelect.value = snapshot.providerKind;
    this.aiToggle.checked = snapshot.aiAuthorized;
    this.confirmToggle.checked = snapshot.confirmationEnabled;
    this.connectButton.disabled = snapshot.connected;
    this.disconnectButton.disabled = !snapshot.connected;
    this.scanButton.disabled = snapshot.scanning || (snapshot.providerKind === 'intiface' && !snapshot.connected);
    this.stopScanButton.disabled = !snapshot.scanning;
    this.selectDeviceButton.disabled = this.deviceSelect.value === '' || !snapshot.connected;
    this.floatingStop.classList.toggle('toylink-is-active', snapshot.active);
    this.floatingStop.textContent = snapshot.active ? '立即停止（正在运行）' : '立即停止';
    this.renderDeviceOptions();
    this.renderSettings();
  }

  destroy(): void { this.floatingStop.remove(); this.root.remove(); }

  private buildProviderStep(): void {
    const section = node('div', 'toylink-step');
    section.append(step(1, '选择连接方式'));
    const intiface = node('option', '', '通过 Intiface 连接'); intiface.value = 'intiface';
    const ble = node('option', '', '使用自己的蓝牙配置'); ble.value = 'custom-ble';
    this.providerSelect.append(intiface, ble);
    this.providerSelect.addEventListener('change', () => { void this.run(() => this.callbacks.changeProvider(this.providerSelect.value as ProviderKind)); });
    section.append(labeled('连接方式', this.providerSelect, 'Intiface 适合已受支持的设备；蓝牙配置适合你已经合法持有设备指令的情况。'));
    this.root.append(section);
  }

  private buildConnectionStep(bluetoothSupported: boolean): void {
    const section = node('div', 'toylink-step');
    section.append(step(2, '连接'));
    this.endpointInput.type = 'url';
    this.endpointInput.placeholder = 'ws://127.0.0.1:12345';
    this.endpointInput.addEventListener('change', () => this.callbacks.saveEndpoint(this.endpointInput.value.trim()));
    this.intifaceSection.append(labeled('Intiface 地址', this.endpointInput, '127.0.0.1 指正在打开本页面的手机或电脑，不是 SillyTavern 所在服务器。'));

    this.profileSelect.addEventListener('change', () => { void this.run(() => this.callbacks.selectBleProfile(this.profileSelect.value || null)); });
    this.profileEditor.rows = 9;
    this.profileEditor.placeholder = '在这里粘贴蓝牙配置 JSON';
    const profileActions = node('div', 'toylink-actions');
    const save = button('检查并保存');
    const importButton = button('从文件导入');
    const exportButton = button('导出当前配置');
    const deleteButton = button('删除当前配置');
    const file = node('input') as HTMLInputElement; file.type = 'file'; file.accept = 'application/json,.json'; file.hidden = true;
    save.addEventListener('click', () => { void this.run(() => this.callbacks.saveBleProfile(this.profileEditor.value)); });
    importButton.addEventListener('click', () => file.click());
    file.addEventListener('change', () => { const selected = file.files?.[0]; if (selected) void this.run(() => this.callbacks.importBleProfile(selected)); file.value = ''; });
    exportButton.addEventListener('click', () => this.callbacks.exportBleProfile());
    deleteButton.addEventListener('click', () => { void this.run(() => this.callbacks.deleteBleProfile()); });
    profileActions.append(save, importButton, exportButton, deleteButton, file);
    this.bleSection.append(labeled('已保存的蓝牙配置', this.profileSelect), labeled('配置内容', this.profileEditor, '配置由你提供，ToyLink 只检查格式，不验证具体设备兼容性。'), profileActions);
    if (!bluetoothSupported) this.bleSection.append(node('p', 'toylink-warning', '当前浏览器不支持直接连接蓝牙设备。你仍可检查和保存配置。'));

    const connectionActions = node('div', 'toylink-actions');
    this.connectButton.addEventListener('click', () => { void this.run(() => this.callbacks.connect()); });
    this.disconnectButton.addEventListener('click', () => { void this.run(() => this.callbacks.disconnect()); });
    connectionActions.append(this.connectButton, this.disconnectButton);
    section.append(this.intifaceSection, this.bleSection, connectionActions);
    this.root.append(section);
  }

  private buildDeviceStep(): void {
    const section = node('div', 'toylink-step');
    section.append(step(3, '查找并选择设备'));
    const actions = node('div', 'toylink-actions');
    const refresh = button('刷新列表');
    this.scanButton.addEventListener('click', () => { void this.run(() => this.callbacks.startScanning()); });
    this.stopScanButton.addEventListener('click', () => { void this.run(() => this.callbacks.stopScanning()); });
    refresh.addEventListener('click', () => this.callbacks.refreshDevices());
    actions.append(this.scanButton, this.stopScanButton, refresh);
    this.deviceSelect.addEventListener('change', () => { this.selectDeviceButton.disabled = this.deviceSelect.value === ''; });
    this.selectDeviceButton.addEventListener('click', () => { if (this.deviceSelect.value) void this.run(() => this.callbacks.selectDevice(this.deviceSelect.value)); });
    section.append(actions, labeled('找到的设备', this.deviceSelect), this.selectDeviceButton);
    this.root.append(section);
  }

  private buildTestStep(): void {
    const section = node('div', 'toylink-step');
    section.append(step(4, '进行安全测试'));
    this.testIntensity.type = 'range'; this.testIntensity.min = '1'; this.testIntensity.max = String(TEST_MAX_INTENSITY * 100); this.testIntensity.value = String(TEST_DEFAULT_INTENSITY * 100);
    this.testDuration.type = 'number'; this.testDuration.min = '100'; this.testDuration.max = String(TEST_MAX_DURATION_MS); this.testDuration.step = '100'; this.testDuration.value = String(TEST_DEFAULT_DURATION_MS);
    const run = button('进行一次低强度测试');
    run.addEventListener('click', () => {
      const intensity = Math.min(TEST_MAX_INTENSITY, Number(this.testIntensity.value) / 100);
      const duration = Math.min(TEST_MAX_DURATION_MS, Number(this.testDuration.value));
      void this.run(() => this.callbacks.runTest(intensity, duration));
    });
    section.append(labeled('测试强度（最高 20%）', this.testIntensity), labeled('测试时长（毫秒，最高 1000）', this.testDuration), run);
    this.root.append(section);
  }

  private buildAiStep(toolCallingSupported: boolean): void {
    const section = node('div', 'toylink-step');
    section.append(step(5, '允许角色控制'));
    this.aiToggle.type = 'checkbox';
    this.aiToggle.addEventListener('change', () => this.callbacks.setAiAuthorized(this.aiToggle.checked));
    this.confirmToggle.type = 'checkbox';
    this.confirmToggle.addEventListener('change', async () => {
      const accepted = await this.callbacks.setConfirmationEnabled(this.confirmToggle.checked);
      if (!accepted) this.confirmToggle.checked = true;
    });
    this.toolSupport.textContent = toolCallingSupported
      ? '当前 SillyTavern 支持角色工具。授权只在本次页面和当前聊天中有效。'
      : '当前 SillyTavern 暂不支持角色直接请求设备，手动测试仍可使用。';
    section.append(labeled('允许当前角色请求设备运行', this.aiToggle), labeled('每次运行前都询问我', this.confirmToggle), this.toolSupport);
    this.root.append(section);
  }

  private buildLimitsStep(): void {
    const section = node('div', 'toylink-step');
    section.append(step(6, '调整安全上限'));
    this.maxIntensity.type = 'number'; this.maxIntensity.min = '1'; this.maxIntensity.max = String(ABSOLUTE_MAX_INTENSITY * 100); this.maxIntensity.step = '1';
    this.maxDuration.type = 'number'; this.maxDuration.min = '100'; this.maxDuration.max = String(ABSOLUTE_MAX_DURATION_MS); this.maxDuration.step = '100';
    const save = button('保存安全上限');
    save.addEventListener('click', () => this.callbacks.setLimits(Number(this.maxIntensity.value) / 100, Number(this.maxDuration.value)));
    section.append(labeled('最大强度（百分比，最高 70）', this.maxIntensity), labeled('最长时间（毫秒，最高 10000）', this.maxDuration), save);
    this.root.append(section);
  }

  private buildDetails(): void {
    const details = node('details', 'toylink-details');
    const summary = node('summary', '', '连接详情与浏览器限制');
    details.append(summary, node('p', '', '如果 SillyTavern 页面使用 HTTPS，浏览器通常会拦截 ws:// 连接。ToyLink 不会关闭安全检查或通过公共代理转发。'), node('p', '', '系统蓝牙选择窗口无法被网页强制关闭；点击“停止查找”后，如果窗口仍在，请手动关闭。'));
    this.root.append(details);
  }

  private renderSettings(): void {
    this.endpointInput.value = this.settings.intifaceEndpoint;
    this.maxIntensity.value = String(Math.round(this.settings.limits.maxIntensity * 100));
    this.maxDuration.value = String(this.settings.limits.maxDurationMs);
    this.confirmToggle.checked = this.settings.confirmationEnabled;
    const isBle = this.settings.providerKind === 'custom-ble';
    this.bleSection.hidden = !isBle;
    this.intifaceSection.hidden = isBle;
    this.connectButton.textContent = isBle ? '打开系统设备选择窗口' : '连接 Intiface';
    this.scanButton.textContent = isBle ? '重新选择设备' : '开始查找';
    this.renderProfileOptions();
  }

  private renderProfileOptions(): void {
    const current = this.settings.selectedBleProfileId ?? '';
    this.profileSelect.replaceChildren();
    const empty = node('option', '', '请选择蓝牙配置'); empty.value = '';
    this.profileSelect.append(empty);
    for (const stored of this.settings.bleProfiles) {
      const option = node('option', '', stored.profile.name); option.value = stored.id; this.profileSelect.append(option);
    }
    this.profileSelect.value = current;
    const selected = this.settings.bleProfiles.find((item) => item.id === current);
    if (selected && document.activeElement !== this.profileEditor) this.profileEditor.value = JSON.stringify(selected.profile, null, 2);
  }

  private renderDeviceOptions(): void {
    const snapshot = this.snapshot;
    if (!snapshot) return;
    const previous = snapshot.selectedDeviceId ?? this.deviceSelect.value;
    this.deviceSelect.replaceChildren();
    const empty = node('option', '', snapshot.devices.length > 0 ? '请选择一个设备' : '暂时没有设备'); empty.value = '';
    this.deviceSelect.append(empty);
    for (const device of snapshot.devices) {
      const option = node('option', '', device.name); option.value = device.id; this.deviceSelect.append(option);
    }
    this.deviceSelect.value = snapshot.devices.some((device) => device.id === previous) ? previous : '';
    this.selectDeviceButton.disabled = this.deviceSelect.value === '' || !snapshot.connected;
  }

  private async run(action: () => Promise<void>): Promise<void> {
    try { await action(); } catch { /* coordinator/provider already exposes a safe message */ }
  }
}
