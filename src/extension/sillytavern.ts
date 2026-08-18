export interface SillyTavernFunctionTool {
  name: string;
  displayName: string;
  description: string;
  parameters: Record<string, unknown>;
  action: (args: unknown) => Promise<string> | string;
  formatMessage?: () => string;
  shouldRegister?: () => boolean;
}

export interface SillyTavernEventSource {
  on(event: string, handler: (...args: unknown[]) => void): void;
  off?(event: string, handler: (...args: unknown[]) => void): void;
}

export interface SillyTavernContext {
  extensionSettings: Record<string, unknown>;
  saveSettingsDebounced(): void;
  registerFunctionTool?: (tool: SillyTavernFunctionTool) => void;
  unregisterFunctionTool?: (name: string) => void;
  eventSource?: SillyTavernEventSource;
  event_types?: Record<string, string>;
  chatId?: string | number;
  characterId?: string | number;
}

export interface SillyTavernGlobal {
  getContext(): SillyTavernContext;
}

declare global {
  var SillyTavern: SillyTavernGlobal | undefined;
}

export function getSillyTavernContext(): SillyTavernContext | null {
  try { return globalThis.SillyTavern?.getContext() ?? null; }
  catch { return null; }
}

export async function waitForExtensionSettings(timeoutMs = 15_000): Promise<HTMLElement> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const target = document.querySelector<HTMLElement>('#extensions_settings');
    if (target) return target;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('没有找到 SillyTavern 扩展设置区域。');
}

/** Wait for SillyTavern's dynamically-created magic-wand extensions menu. */
export async function waitForExtensionsMenu(timeoutMs = 15_000): Promise<HTMLElement> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const target = document.querySelector<HTMLElement>('#extensionsMenu, #extensions_menu');
    if (target) return target;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('没有找到 SillyTavern 魔法棒菜单。');
}
