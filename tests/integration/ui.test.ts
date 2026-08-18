import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToyLinkPanel, type ToyLinkUiCallbacks } from '../../src/ui/settings-panel';
import { ToyLinkSettingsDisclosure } from '../../src/ui/settings-disclosure';
import { ToyLinkEmergencyStopMenu } from '../../src/ui/emergency-stop-menu';
import { ToyLinkWandMenu } from '../../src/ui/wand-menu';
import { createToyLinkMainPanel } from '../../src/ui/main-panel';
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
  it('展示六个步骤且不再创建右下角悬浮按钮', () => {
    const panel = new ToyLinkPanel(structuredClone(DEFAULT_SETTINGS), callbacks, false, false);
    document.body.append(panel.root);
    expect(panel.root.textContent).toContain('选择连接方式');
    expect(panel.root.textContent).toContain('调整安全上限');
    expect(panel.root.textContent).toContain('当前 SillyTavern 暂不支持');
    expect(document.querySelector('.toylink-emergency-stop')).toBeNull();
    panel.destroy();
  });


  it('把立即停止放进魔法棒菜单，并随运行状态更新', async () => {
    const host = document.createElement('div');
    host.id = 'extensionsMenu';
    document.body.append(host);
    let stopCalls = 0;
    const menu = new ToyLinkEmergencyStopMenu(async () => { stopCalls += 1; });
    host.append(menu.button);
    const snapshot: CoordinatorSnapshot = {
      providerKind: 'intiface', connected: false, scanning: false, devices: [],
      selectedDeviceId: null, aiAuthorized: false, active: false,
      status: '尚未连接设备。', error: null, limits: { ...DEFAULT_SETTINGS.limits }, confirmationEnabled: true,
    };
    menu.update(snapshot);
    expect(host.querySelector('.toylink-menu-stop')).toBe(menu.button);
    expect(menu.button.textContent).toBe('立即停止');
    menu.button.click();
    await Promise.resolve();
    expect(stopCalls).toBe(1);

    menu.update({ ...snapshot, active: true });
    expect(menu.button.textContent).toContain('正在运行');
    expect(document.querySelector('.toylink-emergency-stop')).toBeNull();
    menu.destroy();
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


describe('ToyLink 主面板开关', () => {
  it('启动时隐藏，打开后显示，关闭后恢复隐藏', () => {
    const panel = new ToyLinkPanel(structuredClone(DEFAULT_SETTINGS), callbacks, false, false);
    const mainPanel = createToyLinkMainPanel(panel);

    expect(mainPanel.root.hidden).toBe(true);
    expect(mainPanel.root.getAttribute('aria-hidden')).toBe('true');

    mainPanel.open();
    expect(mainPanel.root.hidden).toBe(false);
    expect(mainPanel.root.getAttribute('aria-hidden')).toBe('false');

    mainPanel.close();
    expect(mainPanel.root.hidden).toBe(true);
    expect(mainPanel.root.getAttribute('aria-hidden')).toBe('true');

    mainPanel.destroy();
  });

  it('点击遮罩或按 Escape 可以关闭', () => {
    const panel = new ToyLinkPanel(structuredClone(DEFAULT_SETTINGS), callbacks, false, false);
    const mainPanel = createToyLinkMainPanel(panel);
    mainPanel.open();

    mainPanel.root.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(mainPanel.root.hidden).toBe(true);

    mainPanel.open();
    mainPanel.root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(mainPanel.root.hidden).toBe(true);

    mainPanel.destroy();
  });
});

describe('SillyTavern 原生界面适配', () => {
  it('使用原生 inline-drawer 结构并默认收起', () => {
    const panel = new ToyLinkPanel(structuredClone(DEFAULT_SETTINGS), callbacks, true, true);
    const disclosure = new ToyLinkSettingsDisclosure(panel.root);
    document.body.append(disclosure.root);

    expect(disclosure.root.classList.contains('inline-drawer')).toBe(true);
    expect(disclosure.root.classList.contains('extension_container')).toBe(true);
    expect(disclosure.root.querySelector('.inline-drawer-toggle')).not.toBeNull();
    expect(disclosure.root.querySelector('.inline-drawer-header')).not.toBeNull();
    expect(disclosure.root.querySelector('.inline-drawer-icon.fa-circle-chevron-down')).not.toBeNull();
    expect(disclosure.root.querySelector('.inline-drawer-content')).not.toBeNull();
    expect(disclosure.root.querySelector('.inline-drawer-header summary')).toBeNull();
    expect(disclosure.root.querySelector('.inline-drawer-header')?.textContent).toContain('ToyLink 设置');
    expect(disclosure.root.querySelector('.inline-drawer-header')?.getAttribute('aria-expanded')).toBe('false');

    disclosure.root.dispatchEvent(new Event('inline-drawer-toggle'));
    expect(disclosure.root.querySelector('.inline-drawer-header')?.getAttribute('aria-expanded')).toBe('true');
    disclosure.root.dispatchEvent(new Event('inline-drawer-toggle'));
    expect(disclosure.root.querySelector('.inline-drawer-header')?.getAttribute('aria-expanded')).toBe('false');
    panel.destroy();
    disclosure.destroy();
  });

  it('使用酒馆魔法棒菜单的原生按钮结构，不创建悬浮停止按钮', async () => {
    const host = document.createElement('div');
    host.id = 'extensionsMenu';
    document.body.append(host);
    let stopCalls = 0;
    const menu = new ToyLinkEmergencyStopMenu(async () => { stopCalls += 1; });
    host.append(menu.container);
    const snapshot: CoordinatorSnapshot = {
      providerKind: 'intiface', connected: false, scanning: false, devices: [],
      selectedDeviceId: null, aiAuthorized: false, active: false,
      status: '尚未连接设备。', error: null, limits: { ...DEFAULT_SETTINGS.limits }, confirmationEnabled: true,
    };
    menu.update(snapshot);
    expect(host.querySelector('.extension_container')).toBe(menu.container);
    expect(menu.button.classList.contains('list-group-item')).toBe(true);
    expect(menu.button.classList.contains('flex-container')).toBe(true);
    expect(menu.button.classList.contains('flexGap5')).toBe(true);
    expect(menu.button.querySelector('.fa-stop.extensionsMenuExtensionButton')).not.toBeNull();
    expect(menu.button.querySelector('.toylink-menu-stop-label')?.textContent).toBe('立即停止');
    expect(menu.button.textContent).toBe('立即停止');
    expect(menu.button.style.position).toBe('');
    menu.button.click();
    await Promise.resolve();
    expect(stopCalls).toBe(1);

    menu.update({ ...snapshot, active: true });
    expect(menu.button.textContent).toContain('正在运行');
    expect(document.querySelector('.toylink-emergency-stop')).toBeNull();
    menu.destroy();
  });
});


describe('Magic wand mount location', () => {
  it('does not mount into the extension settings drawer', () => {
    const settingsDrawer = document.createElement('div');
    settingsDrawer.className = 'extensions_block';
    document.body.append(settingsDrawer);
    const host = document.createElement('div');
    host.id = 'extensionsMenu';
    document.body.append(host);

    const menu = new ToyLinkWandMenu(noopAsync, noopAsync);
    menu.observe();

    expect(host.querySelector('#toylink-open-wand-container')).not.toBeNull();
    expect(host.querySelector('#toylink-emergency-stop-wand-container')).not.toBeNull();
    expect(settingsDrawer.querySelector('#toylink-open-wand-container')).toBeNull();
    menu.destroy();
  });
});
