import { describe, expect, it } from 'vitest';
import { ToyLinkCoordinator, type ConfirmationService } from '../../src/core/coordinator';
import { DEFAULT_SETTINGS } from '../../src/core/settings';
import { FakeProvider } from '../../src/providers/fake-provider';
import type { SillyTavernContext, SillyTavernFunctionTool } from '../../src/extension/sillytavern';
import { ToyLinkToolCalling } from '../../src/extension/tool-calling';

async function setup() {
  const provider = new FakeProvider('intiface');
  const confirmation: ConfirmationService = { confirmVibration: async () => true };
  const settings = structuredClone(DEFAULT_SETTINGS);
  settings.confirmationEnabled = false;
  const coordinator = new ToyLinkCoordinator({ intiface: provider, 'custom-ble': new FakeProvider('custom-ble') }, settings, confirmation, () => undefined);
  await coordinator.connect({ endpoint: 'ws://127.0.0.1:12345' });
  coordinator.refreshDevices();
  await coordinator.selectDevice('fake-1');
  const registered = new Map<string, SillyTavernFunctionTool>();
  const context: SillyTavernContext = {
    extensionSettings: {}, saveSettingsDebounced: () => undefined, chatId: 'chat-1',
    registerFunctionTool: (tool) => registered.set(tool.name, tool),
    unregisterFunctionTool: (name) => registered.delete(name),
  };
  const tools = new ToyLinkToolCalling(() => context, coordinator, () => settings);
  tools.refresh();
  return { coordinator, provider, registered, tools };
}

describe('SillyTavern 角色工具', () => {
  it('注册三个中文工具且状态不泄露设备信息', async () => {
    const { registered } = await setup();
    expect([...registered.keys()]).toEqual(['toy_vibrate', 'toy_stop', 'toy_status']);
    expect(registered.get('toy_vibrate')?.description).toContain('用户当前设置');
    const status = await registered.get('toy_status')!.action({});
    expect(status).not.toContain('模拟设备');
    expect(status).not.toContain('127.0.0.1');
  });

  it('未授权时拒绝运行，授权后执行并阻止短时间重复', async () => {
    const { coordinator, provider, registered } = await setup();
    const vibrate = registered.get('toy_vibrate')!;
    await expect(vibrate.action({ intensity: 0.1, duration_ms: 500 })).rejects.toThrow('没有允许');
    coordinator.setAiAuthorized(true);
    expect(await vibrate.action({ intensity: 0.1, duration_ms: 500 })).toContain('实际强度');
    expect(await vibrate.action({ intensity: 0.1, duration_ms: 500 })).toContain('未重复执行');
    expect(provider.calls.filter((call) => call.startsWith('vibrate:'))).toHaveLength(1);
  });

  it('停止工具不需要角色授权', async () => {
    const { provider, registered } = await setup();
    expect(await registered.get('toy_stop')!.action({})).toContain('请求停止');
    expect(provider.calls).toContain('stop');
  });
});
