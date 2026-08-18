import { CommandValidationError, parseToolVibrateArgs } from '../core/command-schema';
import type { ToyLinkCoordinator } from '../core/coordinator';
import type { ToyLinkSettings } from '../core/settings';
import type { SillyTavernContext, SillyTavernFunctionTool } from './sillytavern';

const TOOL_NAMES = ['toy_vibrate', 'toy_stop', 'toy_status'] as const;

function safeToolError(error: unknown): string {
  if (error instanceof CommandValidationError) return error.message;
  if (error instanceof Error && /^(你还没有允许|你取消了|请先|请求|强度|时长)/u.test(error.message) && !/wss?:\/\//iu.test(error.message)) {
    return error.message.slice(0, 160);
  }
  return '设备请求未执行，请查看 ToyLink 面板中的提示。';
}

export class ToyLinkToolCalling {
  private counter = 0;
  private readonly fingerprints = new Map<string, number>();
  private readonly pendingFingerprints = new Set<string>();

  constructor(
    private readonly getContext: () => SillyTavernContext | null,
    private readonly coordinator: ToyLinkCoordinator,
    private readonly getSettings: () => ToyLinkSettings,
  ) {}

  isSupported(): boolean { return typeof this.getContext()?.registerFunctionTool === 'function'; }

  refresh(): void {
    const context = this.getContext();
    if (!context?.registerFunctionTool) return;
    for (const name of TOOL_NAMES) context.unregisterFunctionTool?.(name);
    for (const tool of this.createTools()) context.registerFunctionTool(tool);
  }

  dispose(): void {
    const context = this.getContext();
    for (const name of TOOL_NAMES) context?.unregisterFunctionTool?.(name);
  }

  private createTools(): SillyTavernFunctionTool[] {
    const limits = this.getSettings().limits;
    const limitText = `用户当前设置的最高强度为 ${Math.round(limits.maxIntensity * 100)}%，最长时间为 ${(limits.maxDurationMs / 1000).toFixed(1)} 秒。`;
    return [
      {
        name: 'toy_vibrate',
        displayName: '请求设备运行',
        description: `只有用户已在本次会话中明确授权时才能执行。${limitText}所有请求仍会经过本地安全限制，并可能等待用户逐次确认。`,
        parameters: {
          type: 'object',
          additionalProperties: false,
          required: ['feature', 'intensity', 'duration_ms'],
          properties: {
            feature: { type: 'string', description: '用户已经选择并允许的设备能力标识，例如 vibrate.' },
            intensity: { type: 'number', minimum: 0, maximum: 1, description: '归一化强度，0 到 1。' },
            duration_ms: { type: 'integer', minimum: 1, description: '运行时间，单位为毫秒。' },
          },
        },
        action: async (args) => this.runVibrate(args),
        formatMessage: () => '角色请求设备在你的安全上限内运行',
      },
      {
        name: 'toy_stop',
        displayName: '停止设备',
        description: '立即请求停止当前设备。即使用户没有开启角色控制，也允许执行这个安全操作。',
        parameters: { type: 'object', additionalProperties: false, properties: {} },
        action: async () => {
          try {
            await this.coordinator.execute({ action: 'stop', commandId: this.nextId('stop'), createdAt: Date.now() }, 'ai');
            return '已在用户的浏览器中请求停止。';
          } catch {
            return '停止请求未完成，请查看 ToyLink 面板中的醒目警告。';
          }
        },
        formatMessage: () => '角色请求停止设备',
      },
      {
        name: 'toy_status',
        displayName: '查看设备状态',
        description: '只查看粗略状态，不会返回连接地址、设备名称、设备编号或蓝牙内容。',
        parameters: { type: 'object', additionalProperties: false, properties: {} },
        action: () => this.statusText(),
        formatMessage: () => '角色查看 ToyLink 状态',
      },
    ];
  }

  private async runVibrate(input: unknown): Promise<string> {
    try {
      const args = parseToolVibrateArgs(input);
      const fingerprint = this.fingerprint(args);
      const now = Date.now();
      const previous = this.fingerprints.get(fingerprint);
      if (previous !== undefined && now - previous < 1_500) return '相同请求刚刚已经处理，未重复执行。';
      if (this.pendingFingerprints.has(fingerprint)) return '相同请求正在处理中，未重复执行。';
      this.pendingFingerprints.add(fingerprint);
      for (const [key, timestamp] of this.fingerprints) if (now - timestamp > 10_000) this.fingerprints.delete(key);
      try {
        const applied = await this.coordinator.executeFeature(
          args.feature,
          args.intensity,
          args.duration_ms,
          'ai',
          this.nextId('vibrate'),
        );
        this.fingerprints.set(fingerprint, Date.now());
        return `用户的浏览器已接受请求；实际强度 ${Math.round(applied.intensity * 100)}%，时长 ${(applied.durationMs / 1000).toFixed(1)} 秒。`;
      } finally {
        this.pendingFingerprints.delete(fingerprint);
      }
    } catch (error) {
      throw new Error(safeToolError(error));
    }
  }

  private statusText(): string {
    const status = this.coordinator.getSanitizedStatus();
    return [
      status.connected ? '已连接。' : '未连接。',
      status.deviceSelected ? '用户已选择设备。' : '用户尚未选择设备。',
      status.vibrationAvailable ? '所选设备可以运行。' : '当前没有可用的运行能力。',
      status.aiAuthorized ? '用户已允许本次会话中的角色控制。' : '用户尚未允许角色控制。',
      status.active ? '当前有一项操作正在进行。' : '当前没有正在进行的操作。',
    ].join(' ');
  }

  private fingerprint(args: { feature: string; intensity: number; duration_ms: number }): string {
    const context = this.getContext();
    const chat = String(context?.chatId ?? context?.characterId ?? 'unknown');
    return `${chat}:${args.feature}:${args.intensity.toFixed(6)}:${args.duration_ms}`;
  }

  private nextId(action: string): string {
    this.counter += 1;
    return `ai-${action}-${Date.now()}-${this.counter}`;
  }
}
