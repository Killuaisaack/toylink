import type { CoordinatorSnapshot } from '../core/coordinator';
import type { ToyLinkPanel } from './settings-panel';

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const value = document.createElement(tag);
  if (className) value.className = className;
  if (text !== undefined) value.textContent = text;
  return value;
}

export class ToyLinkSettingsOverview {
  readonly root = node('section', 'toylink-settings-overview');
  private readonly status = node('p', 'toylink-overview-status', '\u5c1a\u672a\u8fde\u63a5\u8bbe\u5907');

  constructor(onOpen: () => void) {
    this.root.append(node('p', 'toylink-intro', '\u5728\u8fd9\u91cc\u6253\u5f00 ToyLink \u4e3b\u9762\u677f\uff0c\u9009\u62e9\u8fde\u63a5\u65b9\u5f0f\u3001\u8bbe\u5907\u548c\u5b89\u5168\u4e0a\u9650\u3002\u8bbe\u7f6e\u9875\u53ea\u4fdd\u7559\u8fd9\u4e2a\u5165\u53e3\uff0c\u4e0d\u4f1a\u81ea\u52a8\u8fde\u63a5\u6216\u6267\u884c\u64cd\u4f5c\u3002'));
    this.status.setAttribute('role', 'status');
    const open = node('button', 'menu_button toylink-primary', '\u6253\u5f00 ToyLink');
    open.type = 'button';
    open.addEventListener('click', onOpen);
    this.root.append(this.status, open);
  }

  update(snapshot: CoordinatorSnapshot): void { this.status.textContent = snapshot.status; }
  destroy(): void { this.root.remove(); }
}

export interface ToyLinkMainPanel {
  readonly root: HTMLDivElement;
  open(): void;
  close(): void;
  update(snapshot: CoordinatorSnapshot, settings: Parameters<ToyLinkPanel['update']>[1]): void;
  destroy(): void;
}

export function createToyLinkMainPanel(panel: ToyLinkPanel): ToyLinkMainPanel {
  const backdrop = node('div', 'toylink-modal-backdrop');
  backdrop.hidden = true;
  backdrop.setAttribute('aria-hidden', 'true');
  const dialog = node('section', 'toylink-modal');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', 'ToyLink 主面板');
  const header = node('div', 'toylink-modal-header');
  header.append(node('h3', '', 'ToyLink'), node('p', 'toylink-hint', '连接设备、进行安全测试，并在需要时允许当前角色请求设备运行。'));
  const close = node('button', 'menu_button', '关闭');
  const setOpen = (open: boolean): void => {
    backdrop.hidden = !open;
    backdrop.setAttribute('aria-hidden', open ? 'false' : 'true');
  };
  const closePanel = (): void => setOpen(false);
  close.type = 'button';
  close.addEventListener('click', closePanel);
  header.append(close);
  dialog.append(header, panel.root);
  backdrop.append(dialog);
  backdrop.addEventListener('click', (event) => { if (event.target === backdrop) closePanel(); });
  backdrop.addEventListener('keydown', (event) => { if (event.key === 'Escape') closePanel(); });
  document.body.append(backdrop);
  setOpen(false);
  return {
    root: backdrop,
    open: () => { setOpen(true); close.focus(); },
    close: closePanel,
    update: (snapshot, settings) => panel.update(snapshot, settings),
    destroy: () => { panel.destroy(); backdrop.remove(); },
  };
}
