import type { CoordinatorSnapshot } from '../core/coordinator';

function createMenu(): { container: HTMLDivElement; button: HTMLDivElement; label: HTMLSpanElement } {
  const container = document.createElement('div');
  container.className = 'extension_container';
  container.id = 'toylink-emergency-stop-wand-container';

  // Match SillyTavern's native wand item shape so the host supplies the
  // same spacing, colors, hover state, and touch target as other entries.
  const value = document.createElement('div');
  value.className = 'list-group-item flex-container flexGap5 toylink-menu-stop';
  value.setAttribute('role', 'button');
  value.setAttribute('tabindex', '0');
  value.setAttribute('aria-label', '立即停止 ToyLink 设备');
  value.title = '停止 ToyLink 当前运行';

  const icon = document.createElement('div');
  icon.className = 'fa-fw fa-solid fa-stop extensionsMenuExtensionButton';
  icon.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  label.className = 'toylink-menu-stop-label';
  label.textContent = '立即停止';
  value.append(icon, label);
  container.append(value);
  return { container, button: value, label };
}

/** The only ToyLink control exposed in SillyTavern's magic-wand menu. */
export class ToyLinkEmergencyStopMenu {
  readonly container: HTMLDivElement;
  readonly button: HTMLDivElement;
  private readonly label: HTMLSpanElement;

  constructor(private readonly onStop: () => Promise<void>) {
    const menu = createMenu();
    this.container = menu.container;
    this.button = menu.button;
    this.label = menu.label;
    this.button.addEventListener('click', () => {
      void this.handleClick();
    });
    this.button.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      void this.handleClick();
    });
  }

  update(snapshot: CoordinatorSnapshot): void {
    this.button.classList.toggle('toylink-is-active', snapshot.active);
    this.label.textContent = snapshot.active ? '立即停止（正在运行）' : '立即停止';
    this.button.setAttribute(
      'aria-label',
      snapshot.active ? '立即停止 ToyLink 当前运行的设备动作' : '立即停止 ToyLink 设备',
    );
  }

  destroy(): void {
    this.container.remove();
  }

  private async handleClick(): Promise<void> {
    try {
      await this.onStop();
    } catch {
      // Coordinator records a sanitized warning in the main ToyLink status area.
    }
  }
}
