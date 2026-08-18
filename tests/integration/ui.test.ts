import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToyLinkPanel, type ToyLinkUiCallbacks } from '../../src/ui/settings-panel';
import { ToyLinkSettingsDisclosure } from '../../src/ui/settings-disclosure';
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


describe('collapsed extension settings entry', () => {
  it('keeps the full ToyLink panel collapsed until the user opens it', () => {
    const panel = new ToyLinkPanel(structuredClone(DEFAULT_SETTINGS), callbacks, true, true);
    const disclosure = new ToyLinkSettingsDisclosure(panel.root);
    document.body.append(disclosure.root);

    expect(disclosure.root.open).toBe(false);
    expect(disclosure.root.querySelector('summary')?.textContent).toContain('ToyLink \u8bbe\u7f6e');
    expect(disclosure.root.querySelector('summary')?.textContent).toContain('\u70b9\u51fb\u5c55\u5f00');
    expect(disclosure.root.querySelector('#toylink-settings')).toBe(panel.root);

    disclosure.root.open = true;
    disclosure.root.dispatchEvent(new Event('toggle'));
    expect(disclosure.root.querySelector('summary')?.textContent).toContain('\u70b9\u51fb\u6536\u8d77');
    panel.destroy();
    disclosure.destroy();
  });
});
