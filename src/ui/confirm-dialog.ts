import type { ConfirmationRequest, ConfirmationService } from '../core/coordinator';

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function showDialog(title: string, paragraphs: readonly string[], confirmLabel = '允许这一次'): Promise<boolean> {
  return new Promise((resolve) => {
    const backdrop = element('div', 'toylink-modal-backdrop');
    const dialog = element('div', 'toylink-modal');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', title);
    dialog.append(element('h3', '', title));
    for (const paragraph of paragraphs) dialog.append(element('p', '', paragraph));
    const actions = element('div', 'toylink-modal-actions');
    const cancel = element('button', 'menu_button', '取消');
    const confirm = element('button', 'menu_button toylink-primary', confirmLabel);
    actions.append(cancel, confirm);
    dialog.append(actions);
    backdrop.append(dialog);
    document.body.append(backdrop);
    const finish = (answer: boolean): void => {
      backdrop.remove();
      resolve(answer);
    };
    cancel.addEventListener('click', () => finish(false));
    confirm.addEventListener('click', () => finish(true));
    backdrop.addEventListener('click', (event) => { if (event.target === backdrop) finish(false); });
    dialog.addEventListener('keydown', (event) => { if (event.key === 'Escape') finish(false); });
    confirm.focus();
  });
}

export class ChineseConfirmationService implements ConfirmationService {
  confirmVibration(request: ConfirmationRequest): Promise<boolean> {
    const actor = request.origin === 'ai' ? '角色想让设备运行。' : '你正在进行低强度测试。';
    const actual = `实际将使用：强度 ${Math.round(request.applied.intensity * 100)}%，时长 ${(request.applied.durationMs / 1000).toFixed(1)} 秒。`;
    const limited = request.applied.wasLimited
      ? `原请求为 ${Math.round(request.requested.intensity * 100)}% / ${(request.requested.durationMs / 1000).toFixed(1)} 秒，已按你的安全上限降低。`
      : '数值没有超过你设置的安全上限。';
    return showDialog('确认这次操作', [actor, actual, limited]);
  }
}

export function confirmDangerousSetting(): Promise<boolean> {
  return showDialog(
    '关闭每次确认？',
    ['之后角色发出的请求会在你的安全上限内直接执行。', '角色控制每次打开页面仍然默认为关闭，你也可以随时点击“立即停止”。'],
    '我了解并关闭确认',
  );
}

export function confirmNonLoopback(endpoint: string): Promise<boolean> {
  return showDialog(
    '确认连接到其他地址',
    [`你填写的是 ${endpoint}。它不是当前手机或电脑上的本机地址。`, '只有在你信任该地址并清楚网络路径时才继续。'],
    '继续连接',
  );
}

export function confirmBlePayload(details: { profileName: string; payloadHex: string }): Promise<boolean> {
  return showDialog(
    '第一次使用这份蓝牙配置',
    [`配置名称：${details.profileName}`, `即将发送的低强度设备指令：${details.payloadHex}`, 'ToyLink 只能检查格式，不能确认这串内容是否适合你的设备。请在可以立即停止设备的情况下继续。'],
    '确认并进行测试',
  );
}

export function confirmDeleteProfile(name: string): Promise<boolean> {
  return showDialog('删除蓝牙配置？', [`将删除“${name}”。此操作不会影响你电脑上的原始文件。`], '删除');
}
