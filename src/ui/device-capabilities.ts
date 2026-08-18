import type { ToyDeviceSummary, ToyFeature } from '../providers/toy-provider';

const TYPE_LABELS: Record<ToyFeature['type'], string> = {
  vibrate: '\u632f\u52a8', rotate: '\u65cb\u8f6c', linear: '\u76f4\u7ebf\u8fd0\u52a8',
  oscillate: '\u6446\u52a8', constrict: '\u6536\u7f29', unknown: '\u672a\u77e5\u80fd\u529b',
};

function text(tag: keyof HTMLElementTagNameMap, value: string): HTMLElement {
  const element = document.createElement(tag); element.textContent = value; return element;
}

export function createDeviceCapabilitiesView(device: ToyDeviceSummary | null): HTMLElement {
  const root = document.createElement('div'); root.className = 'toylink-device-capabilities';
  if (!device) { root.append(text('p', '\u8bf7\u5148\u9009\u62e9\u8bbe\u5907\u3002')); return root; }
  root.append(text('h4', `\u8bbe\u5907\uff1a${device.name}`));
  const list = document.createElement('ul');
  const features = device.capabilities.features ?? (device.capabilities.vibrate ? [{ id: 'vibrate', type: 'vibrate' as const, label: '\u632f\u52a8', actuatorIndex: 0, supported: true }] : []);
  for (const feature of features) {
    const item = document.createElement('li');
    item.append(text('strong', feature.label), text('span', `\uff08${TYPE_LABELS[feature.type]}\uff09`), text('span', feature.supported ? ' \u53ef\u7528' : ' \u5f53\u524d\u7248\u672c\u4e0d\u652f\u6301\u72ec\u7acb\u63a7\u5236'));
    list.append(item);
  }
  root.append(list, text('p', device.capabilities.canStop === false ? '\u8fd9\u4e2a\u8bbe\u5907\u6ca1\u6709\u53ef\u786e\u8ba4\u7684\u505c\u6b62\u80fd\u529b\u3002' : '\u652f\u6301\u505c\u6b62\u64cd\u4f5c\u3002'));
  return root;
}
