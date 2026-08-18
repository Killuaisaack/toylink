function node<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const value = document.createElement(tag);
  if (className) value.className = className;
  if (text !== undefined) value.textContent = text;
  return value;
}

/** A collapsed settings entry for the SillyTavern extensions settings drawer. */
export class ToyLinkSettingsDisclosure {
  readonly root = node('details', 'toylink-settings-entry extension_container');

  constructor(content: HTMLElement) {
    this.root.id = 'toylink-settings-entry';
    const summary = node('summary', 'toylink-settings-summary');
    const title = node('span', 'toylink-settings-title', 'ToyLink \u8bbe\u7f6e');
    const hint = node('span', 'toylink-settings-summary-hint', '\u70b9\u51fb\u5c55\u5f00');
    summary.append(title, hint);
    summary.setAttribute('aria-label', '\u5c55\u5f00\u6216\u6536\u8d77 ToyLink \u8bbe\u7f6e');
    const body = node('div', 'toylink-settings-body');
    body.append(content);
    this.root.append(summary, body);
    this.root.addEventListener('toggle', () => {
      hint.textContent = this.root.open ? '\u70b9\u51fb\u6536\u8d77' : '\u70b9\u51fb\u5c55\u5f00';
    });
  }

  destroy(): void {
    this.root.remove();
  }
}
