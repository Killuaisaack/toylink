import type { CoordinatorSnapshot } from '../core/coordinator';

function createButton(): HTMLButtonElement {
  const value = document.createElement('button');
  value.type = 'button';
  value.className = 'menu_button toylink-menu-stop';
  value.textContent = '立即停止';
  value.setAttribute('aria-label', '立即停止 ToyLink 设备');
  value.title = '停止 ToyLink 当前运行';
  return value;
}

/** The only ToyLink control exposed in SillyTavern's magic-wand menu. */
export class ToyLinkEmergencyStopMenu {
  readonly button = createButton();

  constructor(private readonly onStop: () => Promise<void>) {
    this.button.addEventListener('click', () => {
      void this.handleClick();
    });
  }

  update(snapshot: CoordinatorSnapshot): void {
    this.button.classList.toggle('toylink-is-active', snapshot.active);
    this.button.textContent = snapshot.active ? '立即停止（正在运行）' : '立即停止';
    this.button.setAttribute(
      'aria-label',
      snapshot.active ? '立即停止 ToyLink 当前运行的设备动作' : '立即停止 ToyLink 设备',
    );
  }

  destroy(): void {
    this.button.remove();
  }

  private async handleClick(): Promise<void> {
    try {
      await this.onStop();
    } catch {
      // Coordinator records a sanitized warning in the main ToyLink status area.
    }
  }
}
