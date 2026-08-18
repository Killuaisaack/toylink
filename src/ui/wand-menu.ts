import type { CoordinatorSnapshot } from '../core/coordinator';
import { ToyLinkEmergencyStopMenu } from './emergency-stop-menu';

function menuItem(id: string, labelText: string, iconName: string, onClick: () => void): HTMLDivElement {
  const container = document.createElement('div');
  container.className = 'extension_container';
  container.id = id;
  const button = document.createElement('div');
  button.className = 'menu_button menu_button_icon';
  button.setAttribute('role', 'button');
  button.setAttribute('tabindex', '0');
  button.setAttribute('aria-label', labelText);
  const icon = document.createElement('i');
  icon.className = `fa-solid ${iconName}`;
  icon.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span');
  text.textContent = labelText;
  button.append(icon, text);
  const run = (): void => onClick();
  button.addEventListener('click', run);
  button.addEventListener('keydown', (event) => { if (event.key !== 'Enter' && event.key !== ' ') return; event.preventDefault(); run(); });
  container.append(button);
  return container;
}

export class ToyLinkWandMenu {
  private observer: MutationObserver | null = null;
  private host: HTMLElement | null = null;
  private readonly openContainer: HTMLDivElement;
  private readonly stopMenu: ToyLinkEmergencyStopMenu;

  constructor(onOpen: () => void, onStop: () => Promise<void>) {
    this.openContainer = menuItem('toylink-open-wand-container', 'ToyLink', 'fa-link', onOpen);
    this.stopMenu = new ToyLinkEmergencyStopMenu(onStop);
  }

  mount(host: HTMLElement): void {
    if (this.host === host && this.isMounted()) return;
    this.unmountItems();
    this.host = host;
    host.append(this.openContainer, this.stopMenu.container);
  }

  observe(root: HTMLElement = document.body): void {
    this.observer?.disconnect();
    this.observer = new MutationObserver(() => this.mountCandidate());
    this.observer.observe(root, { childList: true, subtree: true });
    this.mountCandidate();
  }

  update(snapshot: CoordinatorSnapshot): void { this.stopMenu.update(snapshot); }

  destroy(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.unmountItems();
    this.stopMenu.destroy();
  }

  private mountCandidate(): void {
    const candidate = document.querySelector<HTMLElement>('#extensionsMenu, #extensionsMenuPopup, #extensions_menu, .extensions_block');
    if (candidate) this.mount(candidate);
  }

  private isMounted(): boolean { return this.openContainer.parentElement === this.host && this.stopMenu.container.parentElement === this.host; }
  private unmountItems(): void { this.openContainer.remove(); this.stopMenu.container.remove(); }
}
