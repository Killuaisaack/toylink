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
import type { ToyLinkUiCallbacks } from './settings-panel';

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const value = document.createElement(tag);
  if (className) value.className = className;
  if (text !== undefined) value.textContent = text;
  return value;
}

function button(text: string, primary = false): HTMLButtonElement {
  const value = node('button', primary ? 'menu_button toylink-primary' : 'menu_button', text);
  value.type = 'button';
  return value;
}

function labeled(labelText: string, control: HTMLElement, hint?: string): HTMLLabelElement {
  const label = node('label', 'toylink-field');
  label.append(node('span', 'toylink-label', labelText), control);
  if (hint) label.append(node('small', 'toylink-hint', hint));
  return label;
}

/** Lightweight controls rendered in the magic-wand extensions menu. */
export class ToyLinkQuickPanel {
  readonly root = node('section', 'toylink-quick-panel');
  private snapshot: CoordinatorSnapshot | null = null;
  private settings: ToyLinkSettings;
  private readonly status = node('div', 'toylink-status', '\u6b63\u5728\u521d\u59cb\u5316\u2026');
  private readonly error = node('div', 'toylink-error');
  private readonly providerSelect = node('select') as HTMLSelectElement;
  private readonly endpointInput = node('input') as HTMLInputElement;
  private readonly profileSelect = node('select') as HTMLSelectElement;
  private readonly deviceSelect = node('select') as HTMLSelectElement;
  private readonly connectButton = button('\u8fde\u63a5', true);
  private readonly disconnectButton = button('\u65ad\u5f00');
  private readonly scanButton = button('\u5f00\u59cb\u67e5\u627e');
  private readonly stopScanButton = button('\u505c\u6b62\u67e5\u627e');
  private readonly selectDeviceButton = button('\u4f7f\u7528\u8fd9\u4e2a\u8bbe\u5907');
  private readonly maxIntensity = node('input') as HTMLInputElement;
  private readonly maxDuration = node('input') as HTMLInputElement;
  private readonly aiToggle = node('input') as HTMLInputElement;
  private readonly confirmToggle = node('input') as HTMLInputElement;
  private readonly testIntensity = node('input') as HTMLInputElement;
  private readonly testDuration = node('input') as HTMLInputElement;
  private readonly floatingStop = button('\u7acb\u5373\u505c\u6b62');
  private readonly toolSupport = node('small', 'toylink-hint');
  private readonly intifaceFields = node('div', 'toylink-quick-intiface');
  private readonly bleFields = node('div', 'toylink-quick-ble');

  constructor(
    settings: ToyLinkSettings,
    private readonly callbacks: ToyLinkUiCallbacks,
    toolCallingSupported: boolean,
    bluetoothSupported: boolean,
  ) {
    this.settings = structuredClone(settings);
    this.root.id = 'toylink-quick-panel';
    this.root.setAttribute('aria-label', 'ToyLink \u57fa\u7840\u63a7\u5236');
    this.root.append(node('h3', '', 'ToyLink \u57fa\u7840\u63a7\u5236'));
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    this.error.setAttribute('role', 'alert');
    this.root.append(this.status, this.error);

    this.buildConnection(bluetoothSupported);
    this.buildDevice();
    this.buildSafety(toolCallingSupported);
    this.buildAdvancedLink();

    this.floatingStop.className = 'toylink-emergency-stop';
    this.floatingStop.setAttribute('aria-label', '\u7acb\u5373\u505c\u6b62 ToyLink \u8bbe\u5907');
    this.floatingStop.addEventListener('click', () => { void this.run(() => this.callbacks.emergencyStop()); });
    document.body.append(this.floatingStop);
    this.render();
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
    this.floatingStop.textContent = snapshot.active ? '\u7acb\u5373\u505c\u6b62\uff08\u6b63\u5728\u8fd0\u884c\uff09' : '\u7acb\u5373\u505c\u6b62';
    this.render();
  }

  destroy(): void {
    this.floatingStop.remove();
    this.root.remove();
  }

  private buildConnection(bluetoothSupported: boolean): void {
    const section = node('div', 'toylink-quick-section');
    section.append(node('h4', '', '\u8fde\u63a5\u8bbe\u5907'));
    const intiface = node('option', '', '\u901a\u8fc7 Intiface'); intiface.value = 'intiface';
    const ble = node('option', '', '\u4f7f\u7528\u81ea\u5df1\u7684\u84dd\u7259\u914d\u7f6e'); ble.value = 'custom-ble';
    this.providerSelect.append(intiface, ble);
    this.providerSelect.addEventListener('change', () => { void this.run(() => this.callbacks.changeProvider(this.providerSelect.value as ProviderKind)); });
    section.append(labeled('\u8fde\u63a5\u65b9\u5f0f', this.providerSelect));

    this.endpointInput.type = 'url';
    this.endpointInput.placeholder = 'ws://127.0.0.1:12345';
    this.endpointInput.addEventListener('change', () => this.callbacks.saveEndpoint(this.endpointInput.value.trim()));
    this.intifaceFields.append(labeled('Intiface \u5730\u5740', this.endpointInput, '127.0.0.1 \u6307\u6b63\u5728\u6253\u5f00\u672c\u9875\u9762\u7684\u624b\u673a\u6216\u7535\u8111\u3002'));

    this.profileSelect.addEventListener('change', () => { void this.run(() => this.callbacks.selectBleProfile(this.profileSelect.value || null)); });
    this.bleFields.append(labeled('\u84dd\u7259\u914d\u7f6e', this.profileSelect, '\u914d\u7f6e\u7531\u4f60\u63d0\u4f9b\uff1b\u8be6\u7ec6\u7f16\u8f91\u8bf7\u6253\u5f00\u5b8c\u6574\u8bbe\u7f6e\u3002'));
    if (!bluetoothSupported) this.bleFields.append(node('small', 'toylink-warning', '\u5f53\u524d\u6d4f\u89c8\u5668\u4e0d\u652f\u6301\u76f4\u63a5\u8fde\u63a5\u84dd\u7259\u8bbe\u5907\u3002'));
    section.append(this.intifaceFields, this.bleFields);

    const actions = node('div', 'toylink-actions');
    this.connectButton.addEventListener('click', () => { void this.run(() => this.callbacks.connect()); });
    this.disconnectButton.addEventListener('click', () => { void this.run(() => this.callbacks.disconnect()); });
    actions.append(this.connectButton, this.disconnectButton);
    section.append(actions);
    this.root.append(section);
  }

  private buildDevice(): void {
    const section = node('div', 'toylink-quick-section');
    section.append(node('h4', '', '\u67e5\u627e\u5e76\u9009\u62e9\u8bbe\u5907'));
    const actions = node('div', 'toylink-actions');
    this.scanButton.addEventListener('click', () => { void this.run(() => this.callbacks.startScanning()); });
    this.stopScanButton.addEventListener('click', () => { void this.run(() => this.callbacks.stopScanning()); });
    const refresh = button('\u5237\u65b0\u5217\u8868');
    refresh.addEventListener('click', () => this.callbacks.refreshDevices());
    actions.append(this.scanButton, this.stopScanButton, refresh);
    this.deviceSelect.addEventListener('change', () => { this.selectDeviceButton.disabled = this.deviceSelect.value === ''; });
    this.selectDeviceButton.addEventListener('click', () => { if (this.deviceSelect.value) void this.run(() => this.callbacks.selectDevice(this.deviceSelect.value)); });
    section.append(actions, labeled('\u8bbe\u5907', this.deviceSelect), this.selectDeviceButton);
    this.root.append(section);
  }

  private buildSafety(toolCallingSupported: boolean): void {
    const section = node('div', 'toylink-quick-section');
    section.append(node('h4', '', '\u5b89\u5168\u4e0e\u89d2\u8272\u63a7\u5236'));
    this.maxIntensity.type = 'number'; this.maxIntensity.min = '1'; this.maxIntensity.max = String(ABSOLUTE_MAX_INTENSITY * 100); this.maxIntensity.step = '1';
    this.maxDuration.type = 'number'; this.maxDuration.min = '100'; this.maxDuration.max = String(ABSOLUTE_MAX_DURATION_MS); this.maxDuration.step = '100';
    const saveLimits = button('\u4fdd\u5b58\u5b89\u5168\u4e0a\u9650');
    saveLimits.addEventListener('click', () => this.callbacks.setLimits(Number(this.maxIntensity.value) / 100, Number(this.maxDuration.value)));
    section.append(labeled('\u6700\u5927\u5f3a\u5ea6\uff08\u767e\u5206\u6bd4\uff0c\u6700\u9ad8 70\uff09', this.maxIntensity), labeled('\u6700\u957f\u65f6\u95f4\uff08\u6beb\u79d2\uff0c\u6700\u9ad8 10000\uff09', this.maxDuration), saveLimits);

    this.confirmToggle.type = 'checkbox';
    this.confirmToggle.addEventListener('change', async () => {
      const accepted = await this.callbacks.setConfirmationEnabled(this.confirmToggle.checked);
      if (!accepted) this.confirmToggle.checked = true;
    });
    this.aiToggle.type = 'checkbox';
    this.aiToggle.addEventListener('change', () => this.callbacks.setAiAuthorized(this.aiToggle.checked));
    section.append(labeled('\u6bcf\u6b21\u8fd0\u884c\u524d\u90fd\u8be2\u95ee\u6211', this.confirmToggle), labeled('\u5141\u8bb8\u89d2\u8272\u63a7\u5236', this.aiToggle));
    this.toolSupport.textContent = toolCallingSupported ? '\u89d2\u8272\u6388\u6743\u53ea\u5728\u672c\u6b21\u9875\u9762\u548c\u5f53\u524d\u804a\u5929\u4e2d\u6709\u6548\u3002' : '\u5f53\u524d\u7248\u672c\u6682\u4e0d\u652f\u6301\u89d2\u8272\u76f4\u63a5\u8bf7\u6c42\u8bbe\u5907\uff0c\u624b\u52a8\u6d4b\u8bd5\u4ecd\u53ef\u4f7f\u7528\u3002';
    section.append(this.toolSupport);

    this.testIntensity.type = 'range'; this.testIntensity.min = '1'; this.testIntensity.max = String(TEST_MAX_INTENSITY * 100); this.testIntensity.value = String(TEST_DEFAULT_INTENSITY * 100);
    this.testDuration.type = 'number'; this.testDuration.min = '100'; this.testDuration.max = String(TEST_MAX_DURATION_MS); this.testDuration.step = '100'; this.testDuration.value = String(TEST_DEFAULT_DURATION_MS);
    const test = button('\u4f4e\u5f3a\u5ea6\u6d4b\u8bd5');
    test.addEventListener('click', () => {
      const intensity = Math.min(TEST_MAX_INTENSITY, Number(this.testIntensity.value) / 100);
      const duration = Math.min(TEST_MAX_DURATION_MS, Number(this.testDuration.value));
      void this.run(() => this.callbacks.runTest(intensity, duration));
    });
    section.append(labeled('\u6d4b\u8bd5\u5f3a\u5ea6\uff08\u6700\u9ad8 20%\uff09', this.testIntensity), labeled('\u6d4b\u8bd5\u65f6\u957f\uff08\u6beb\u79d2\uff0c\u6700\u9ad8 1000\uff09', this.testDuration), test);
    this.root.append(section);
  }

  private buildAdvancedLink(): void {
    const section = node('div', 'toylink-quick-actions');
    const open = button('\u6253\u5f00\u5b8c\u6574\u8bbe\u7f6e');
    open.setAttribute('aria-label', '\u6253\u5f00 ToyLink \u5b8c\u6574\u8bbe\u7f6e');
    open.addEventListener('click', () => this.callbacks.openAdvancedSettings?.());
    section.append(open, node('small', 'toylink-hint', '\u84dd\u7259\u914d\u7f6e JSON\u3001\u5bfc\u5165\u5bfc\u51fa\u548c\u8fde\u63a5\u8be6\u60c5\u5728\u5b8c\u6574\u8bbe\u7f6e\u4e2d\u3002'));
    this.root.append(section);
  }

  private render(): void {
    this.endpointInput.value = this.settings.intifaceEndpoint;
    this.maxIntensity.value = String(Math.round(this.settings.limits.maxIntensity * 100));
    this.maxDuration.value = String(this.settings.limits.maxDurationMs);
    this.confirmToggle.checked = this.snapshot?.confirmationEnabled ?? this.settings.confirmationEnabled;
    const isBle = this.settings.providerKind === 'custom-ble';
    this.intifaceFields.hidden = isBle;
    this.bleFields.hidden = !isBle;
    this.connectButton.textContent = isBle ? '\u542f\u7528\u84dd\u7259\u914d\u7f6e' : '\u8fde\u63a5 Intiface';
    this.scanButton.textContent = isBle ? '\u9009\u62e9\u84dd\u7259\u8bbe\u5907' : '\u5f00\u59cb\u67e5\u627e';
    this.renderProfiles();
    this.renderDevices();
  }

  private renderProfiles(): void {
    this.profileSelect.replaceChildren();
    const empty = node('option', '', '\u8bf7\u9009\u62e9\u84dd\u7259\u914d\u7f6e'); empty.value = '';
    this.profileSelect.append(empty);
    for (const profile of this.settings.bleProfiles) {
      const option = node('option', '', profile.profile.name); option.value = profile.id;
      this.profileSelect.append(option);
    }
    this.profileSelect.value = this.settings.selectedBleProfileId ?? '';
  }

  private renderDevices(): void {
    const snapshot = this.snapshot;
    if (!snapshot) return;
    const selected = snapshot.selectedDeviceId ?? '';
    this.deviceSelect.replaceChildren();
    const empty = node('option', '', snapshot.devices.length > 0 ? '\u8bf7\u9009\u62e9\u8bbe\u5907' : '\u6682\u65f6\u6ca1\u6709\u8bbe\u5907'); empty.value = '';
    this.deviceSelect.append(empty);
    for (const device of snapshot.devices) {
      const option = node('option', '', device.name); option.value = device.id;
      this.deviceSelect.append(option);
    }
    this.deviceSelect.value = snapshot.devices.some((device) => device.id === selected) ? selected : '';
    this.selectDeviceButton.disabled = this.deviceSelect.value === '' || !snapshot.connected;
  }

  private async run(action: () => Promise<void>): Promise<void> {
    try { await action(); } catch { /* coordinator reports safe status */ }
  }
}
