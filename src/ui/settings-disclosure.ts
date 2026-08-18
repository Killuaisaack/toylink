function node<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const value = document.createElement(tag);
  if (className) value.className = className;
  if (text !== undefined) value.textContent = text;
  return value;
}

/**
 * Uses SillyTavern's native inline-drawer structure for the full settings panel.
 * SillyTavern's own delegated handler controls the open/closed animation.
 */
export class ToyLinkSettingsDisclosure {
  readonly root = node('div', 'inline-drawer extension_container');
  private readonly header: HTMLDivElement;
  private readonly content: HTMLDivElement;

  constructor(content: HTMLElement) {
    this.root.id = 'toylink-settings-entry';

    this.header = node('div', 'inline-drawer-toggle inline-drawer-header');
    this.header.setAttribute('role', 'button');
    this.header.setAttribute('tabindex', '0');
    this.header.setAttribute('aria-expanded', 'false');
    this.header.setAttribute('aria-label', '展开或收起 ToyLink 设置');

    const title = node('b', '', 'ToyLink 设置');
    const icon = node('div', 'inline-drawer-icon fa-solid fa-circle-chevron-down down');
    icon.setAttribute('aria-hidden', 'true');
    this.header.append(title, icon);

    this.content = node('div', 'inline-drawer-content');
    this.content.append(content);

    this.root.append(this.header, this.content);
    this.root.addEventListener('inline-drawer-toggle', () => {
      const expanded = this.header.getAttribute('aria-expanded') === 'true';
      this.header.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    });
    this.header.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      this.header.click();
    });
  }

  destroy(): void {
    this.root.remove();
  }
}
