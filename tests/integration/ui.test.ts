import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToyLinkPanel, type ToyLinkUiCallbacks } from '../../src/ui/settings-panel';
import { ToyLinkQuickPanel } from '../../src/ui/quick-panel';
import { waitForExtensionsMenu } from '../../src/extension/sillytavern';
import { DEFAULT_SETTINGS } from '../../src/core/settings';
import type { CoordinatorSnapshot } from '../../src/core/coordinator';

const noopAsync = async (): Promise<void> => undefined;
const callbacks: ToyLinkUiCallbacks = {
  changeProvider: noopAsync,
  saveEndpoint: () => undefined,
  connect: noopAsync,
  disconnect: noopAsync,
  startScanning: noopAsync,
  stopScanning: noopAsync,
  refreshDevices: () => undefined,
  selectDevice: noopAsync,
  runTest: noopAsync,
  emergencyStop: noopAsync,
  setAiAuthorized: () => undefined,
  setConfirmationEnabled: async () => true,
  setLimits: () => undefined,
  saveBleProfile: noopAsync,
  importBleProfile: noopAsync,
  exportBleProfile: () => undefined,
  deleteBleProfile: noopAsync,
  selectBleProfile: noopAsync,
};

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

describe('中文引导界面', () => {
  it('展示六个步骤和常驻停止按钮', () => {
    const panel = new ToyLinkPanel(structuredClone(DEFAULT_SETTINGS), callbacks, false, false);
    document.body.append(panel.root);
    expect(panel.root.textContent).toContain('选择连接方式');
    expect(panel.root.textContent).toContain('调整安全上限');
    expect(panel.root.textContent).toContain('当前 SillyTavern 暂不支持');
    expect(document.querySelector('.toylink-emergency-stop')?.textContent).toContain('立即停止');
    panel.destroy();
  });

  it('设备名称只作为文本显示，不创建不安全元素', () => {
    const panel = new ToyLinkPanel(structuredClone(DEFAULT_SETTINGS), callbacks, true, true);
    document.body.append(panel.root);
    const snapshot: CoordinatorSnapshot = {
      providerKind: 'intiface', connected: true, scanning: false,
      devices: [{ id: 'x', name: '<img src=x onerror=alert(1)>', capabilities: { vibrate: true } }],
      selectedDeviceId: null, aiAuthorized: false, active: false,
      status: '已连接', error: null, limits: { ...DEFAULT_SETTINGS.limits }, confirmationEnabled: true,
    };
    panel.update(snapshot, structuredClone(DEFAULT_SETTINGS));
    expect(panel.root.querySelector('img')).toBeNull();
    expect(panel.root.textContent).toContain('<img src=x onerror=alert(1)>');
    panel.destroy();
  });
});


describe('magic wand quick controls', () => {
  it('uses the magic-wand menu instead of the extension settings page', async () => {
    const settingsPage = document.createElement('div');
    settingsPage.id = 'extensions_settings';
    const extensionsMenu = document.createElement('div');
    extensionsMenu.id = 'extensionsMenu';
    document.body.append(settingsPage, extensionsMenu);

    const target = await waitForExtensionsMenu(20);
    const openAdvancedSettings = vi.fn();
    const panel = new ToyLinkQuickPanel(
      structuredClone(DEFAULT_SETTINGS),
      { ...callbacks, openAdvancedSettings },
      true,
      true,
    );
    target.append(panel.root);

    expect(settingsPage.querySelector('#toylink-quick-panel')).toBeNull();
    expect(extensionsMenu.querySelector('#toylink-quick-panel')).toBe(panel.root);
    expect(panel.root.textContent).toContain('\u57fa\u7840\u63a7\u5236');
    expect(panel.root.textContent).toContain('\u5b89\u5168\u4e0e\u89d2\u8272\u63a7\u5236');
    expect(panel.root.textContent).toContain('\u6253\u5f00\u5b8c\u6574\u8bbe\u7f6e');
    expect(document.querySelector('.toylink-emergency-stop')?.textContent).toContain('\u7acb\u5373\u505c\u6b62');

    const advancedButton = [...panel.root.querySelectorAll('button')]
      .find((item) => item.textContent === '\u6253\u5f00\u5b8c\u6574\u8bbe\u7f6e');
    advancedButton?.click();
    expect(openAdvancedSettings).toHaveBeenCalledOnce();
    panel.destroy();
  });

  it('renders device names as plain text in quick controls', () => {
    const panel = new ToyLinkQuickPanel(structuredClone(DEFAULT_SETTINGS), callbacks, true, true);
    document.body.append(panel.root);
    const snapshot: CoordinatorSnapshot = {
      providerKind: 'intiface', connected: true, scanning: false,
      devices: [{ id: 'x', name: '<svg onload=alert(1)>', capabilities: { vibrate: true } }],
      selectedDeviceId: null, aiAuthorized: false, active: false,
      status: '\u5df2\u8fde\u63a5', error: null, limits: { ...DEFAULT_SETTINGS.limits }, confirmationEnabled: true,
    };
    panel.update(snapshot, structuredClone(DEFAULT_SETTINGS));
    expect(panel.root.querySelector('svg')).toBeNull();
    expect(panel.root.textContent).toContain('<svg onload=alert(1)>');
    panel.destroy();
  });
});
