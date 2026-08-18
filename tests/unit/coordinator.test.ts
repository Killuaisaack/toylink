import { describe, expect, it, vi } from 'vitest';
import { ToyLinkCoordinator, type ConfirmationService, type TimerPort } from '../../src/core/coordinator';
import { DEFAULT_SETTINGS } from '../../src/core/settings';
import { FakeProvider } from '../../src/providers/fake-provider';

class FakeTimer implements TimerPort {
  readonly jobs = new Map<number, () => void>();
  private next = 1;
  setTimeout(callback: () => void): unknown { const id = this.next++; this.jobs.set(id, callback); return id; }
  clearTimeout(handle: unknown): void { this.jobs.delete(handle as number); }
  runFirst(): void { const first = this.jobs.entries().next().value as [number, () => void] | undefined; if (first) { this.jobs.delete(first[0]); first[1](); } }
}

function setup(confirm = true) {
  const intiface = new FakeProvider('intiface');
  const ble = new FakeProvider('custom-ble');
  const confirmation: ConfirmationService = { confirmVibration: vi.fn(async () => confirm) };
  const timer = new FakeTimer();
  let now = 10_000;
  const coordinator = new ToyLinkCoordinator({ intiface, 'custom-ble': ble }, structuredClone(DEFAULT_SETTINGS), confirmation, () => undefined, timer, () => now);
  return { coordinator, intiface, ble, confirmation, timer, setNow: (value: number) => { now = value; } };
}

describe('ToyLinkCoordinator', () => {
  it('执行手动运行、应用限制并由定时器停止', async () => {
    const { coordinator, intiface, timer } = setup();
    await coordinator.connect({ endpoint: 'ws://127.0.0.1:12345' });
    coordinator.refreshDevices();
    await coordinator.selectDevice('fake-1');
    const applied = await coordinator.execute({ action: 'vibrate', intensity: 0.8, durationMs: 9000, commandId: 'manual-1', createdAt: 10_000 }, 'manual');
    expect(applied).toMatchObject({ intensity: 0.2, durationMs: 1000, wasLimited: true });
    expect(intiface.calls.some((call) => call.startsWith('vibrate:0.2:1000'))).toBe(true);
    timer.runFirst();
    await Promise.resolve();
    expect(intiface.calls.at(-1)).toBe('stop');
  });

  it('角色未授权时拒绝，授权后允许', async () => {
    const { coordinator } = setup();
    await coordinator.connect({ endpoint: 'ws://127.0.0.1:12345' });
    coordinator.refreshDevices();
    await coordinator.selectDevice('fake-1');
    const command = { action: 'vibrate', intensity: 0.1, durationMs: 500, commandId: 'ai-1', createdAt: 10_000 } as const;
    await expect(coordinator.execute(command, 'ai')).rejects.toThrow('没有允许');
    coordinator.setAiAuthorized(true);
    await expect(coordinator.execute({ ...command, commandId: 'ai-2' }, 'ai')).resolves.toBeTruthy();
  });

  it('确认取消时不运行', async () => {
    const { coordinator, intiface } = setup(false);
    await coordinator.connect({ endpoint: 'ws://127.0.0.1:12345' });
    coordinator.refreshDevices();
    await coordinator.selectDevice('fake-1');
    await expect(coordinator.execute({ action: 'vibrate', intensity: 0.1, durationMs: 500, commandId: 'c-1', createdAt: 10_000 }, 'manual')).rejects.toThrow('取消');
    expect(intiface.calls.some((call) => call.startsWith('vibrate:'))).toBe(false);
  });

  it('拒绝重复请求并在切换连接方式前停止和断开', async () => {
    const { coordinator, intiface } = setup();
    await coordinator.connect({ endpoint: 'ws://127.0.0.1:12345' });
    coordinator.refreshDevices();
    await coordinator.selectDevice('fake-1');
    const command = { action: 'stop', commandId: 'same', createdAt: 10_000 } as const;
    await coordinator.execute(command, 'manual');
    await expect(coordinator.execute(command, 'manual')).rejects.toThrow('已经处理');
    await coordinator.changeProvider('custom-ble');
    expect(intiface.calls).toContain('disconnect');
    expect(coordinator.snapshot().providerKind).toBe('custom-ble');
    expect(coordinator.snapshot().aiAuthorized).toBe(false);
  });

  it('停止失败时重试并给出醒目错误', async () => {
    const { coordinator, intiface } = setup();
    intiface.failStopCount = 3;
    await coordinator.emergencyStop();
    expect(intiface.calls.filter((call) => call === 'stop')).toHaveLength(3);
    expect(coordinator.snapshot().error).toContain('设备自身');
  });
});
