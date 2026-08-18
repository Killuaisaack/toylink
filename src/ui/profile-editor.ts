import { getProfileReadiness, type BleProfileReadinessResult } from '../ble-profile/readiness';

export class ToyLinkProfileEditor {
  readonly root = document.createElement('section');
  readonly textarea = document.createElement('textarea');
  readonly readiness = document.createElement('p');
  private readonly validateButton = document.createElement('button');
  private readonly onValid: ((profile: unknown, readiness: BleProfileReadinessResult) => void) | undefined;

  constructor(onValid?: (profile: unknown, readiness: BleProfileReadinessResult) => void) {
    this.onValid = onValid; this.root.className = 'toylink-profile-editor';
    const title = document.createElement('h4'); title.textContent = '\u84dd\u7259\u914d\u7f6e';
    const hint = document.createElement('p'); hint.textContent = '\u8fd9\u662f\u4f60\u63d0\u4f9b\u7684\u914d\u7f6e\uff0cToyLink \u4e0d\u4f1a\u9a8c\u8bc1\u5177\u4f53\u8bbe\u5907\u662f\u5426\u517c\u5bb9\u3002';
    this.textarea.rows = 12; this.textarea.placeholder = '{\n  "profileVersion": 1\n}';
    this.validateButton.type = 'button'; this.validateButton.className = 'menu_button'; this.validateButton.textContent = '\u6821\u9a8c\u914d\u7f6e';
    this.readiness.setAttribute('role', 'status'); this.readiness.setAttribute('aria-live', 'polite');
    this.validateButton.addEventListener('click', () => this.validate()); this.root.append(title, hint, this.textarea, this.validateButton, this.readiness);
  }

  setValue(value: unknown): void { this.textarea.value = typeof value === 'string' ? value : JSON.stringify(value, null, 2); }
  validate(): BleProfileReadinessResult {
    let input: unknown;
    try { input = JSON.parse(this.textarea.value); }
    catch { const invalid: BleProfileReadinessResult = { state: 'draft', valid: false, missing: [], reasons: ['JSON \u683c\u5f0f\u4e0d\u6b63\u786e\u3002'], nextStep: '\u4fee\u6539 JSON \u540e\u518d\u6821\u9a8c' }; this.readiness.textContent = invalid.reasons[0]!; return invalid; }
    const readiness = getProfileReadiness(input); this.readiness.textContent = readiness.valid ? `\u914d\u7f6e\u72b6\u6001\uff1a${readiness.state}\u3002${readiness.nextStep}\u3002` : readiness.reasons.join(' '); if (readiness.valid) this.onValid?.(input, readiness); return readiness;
  }
}

