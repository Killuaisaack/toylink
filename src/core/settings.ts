import { DEFAULT_MAX_DURATION_MS, DEFAULT_MAX_INTENSITY } from './constants';
import { normalizeLimits, type SafetyLimits } from './safety-controller';
import { StrictBleProfileCodec } from '../ble-profile/codec';
import type { StoredBleProfile } from '../ble-profile/types';
import type { ProviderKind } from '../providers/toy-provider';

export interface ToyLinkSettings {
  settingsVersion: 1;
  providerKind: ProviderKind;
  intifaceEndpoint: string;
  bleProfiles: StoredBleProfile[];
  selectedBleProfileId: string | null;
  limits: SafetyLimits;
  confirmationEnabled: boolean;
  ui: { detailsOpen: boolean };
}

export const DEFAULT_SETTINGS: ToyLinkSettings = {
  settingsVersion: 1,
  providerKind: 'intiface',
  intifaceEndpoint: 'ws://127.0.0.1:12345',
  bleProfiles: [],
  selectedBleProfileId: null,
  limits: { maxIntensity: DEFAULT_MAX_INTENSITY, maxDurationMs: DEFAULT_MAX_DURATION_MS },
  confirmationEnabled: true,
  ui: { detailsOpen: false },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isValidWebSocketEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'ws:' || url.protocol === 'wss:') && url.username === '' && url.password === '';
  } catch {
    return false;
  }
}

export function isLoopbackEndpoint(value: string): boolean {
  try {
    const host = new URL(value).hostname.replace(/^\[|\]$/g, '').toLowerCase();
    return host === '127.0.0.1' || host === 'localhost' || host === '::1';
  } catch {
    return false;
  }
}

const SETTINGS_KEYS = ['settingsVersion', 'providerKind', 'intifaceEndpoint', 'bleProfiles', 'selectedBleProfileId', 'limits', 'confirmationEnabled', 'ui'] as const;
const LIMIT_KEYS = ['maxIntensity', 'maxDurationMs'] as const;
const UI_KEYS = ['detailsOpen'] as const;

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isValidProfileId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/u.test(value);
}

export function parseSettings(input: unknown): ToyLinkSettings {
  if (!isRecord(input) || input.settingsVersion !== 1 || !hasExactKeys(input, SETTINGS_KEYS)) {
    return structuredClone(DEFAULT_SETTINGS);
  }
  if (input.providerKind !== 'intiface' && input.providerKind !== 'custom-ble') {
    return structuredClone(DEFAULT_SETTINGS);
  }
  if (typeof input.intifaceEndpoint !== 'string' || !isValidWebSocketEndpoint(input.intifaceEndpoint)) {
    return structuredClone(DEFAULT_SETTINGS);
  }
  if (typeof input.confirmationEnabled !== 'boolean' || !isRecord(input.limits) || !hasExactKeys(input.limits, LIMIT_KEYS)) {
    return structuredClone(DEFAULT_SETTINGS);
  }
  if (!isRecord(input.ui) || !hasExactKeys(input.ui, UI_KEYS) || typeof input.ui.detailsOpen !== 'boolean') {
    return structuredClone(DEFAULT_SETTINGS);
  }
  if (!Array.isArray(input.bleProfiles)) return structuredClone(DEFAULT_SETTINGS);
  const codec = new StrictBleProfileCodec();
  const profiles: StoredBleProfile[] = [];
  const ids = new Set<string>();
  for (const item of input.bleProfiles) {
    if (!isRecord(item) || !hasExactKeys(item, ['id', 'profile']) || !isValidProfileId(item.id) || ids.has(item.id)) {
      return structuredClone(DEFAULT_SETTINGS);
    }
    try {
      profiles.push({ id: item.id, profile: codec.validate(item.profile) });
      ids.add(item.id);
    } catch {
      return structuredClone(DEFAULT_SETTINGS);
    }
  }
  if (input.selectedBleProfileId !== null && (!isValidProfileId(input.selectedBleProfileId) || !ids.has(input.selectedBleProfileId))) {
    return structuredClone(DEFAULT_SETTINGS);
  }
  const rawLimits: Partial<SafetyLimits> = {};
  if (typeof input.limits.maxIntensity === 'number') rawLimits.maxIntensity = input.limits.maxIntensity;
  if (typeof input.limits.maxDurationMs === 'number') rawLimits.maxDurationMs = input.limits.maxDurationMs;
  if (rawLimits.maxIntensity === undefined || rawLimits.maxDurationMs === undefined) {
    return structuredClone(DEFAULT_SETTINGS);
  }
  return {
    settingsVersion: 1,
    providerKind: input.providerKind,
    intifaceEndpoint: input.intifaceEndpoint,
    bleProfiles: profiles,
    selectedBleProfileId: input.selectedBleProfileId,
    limits: normalizeLimits(rawLimits),
    confirmationEnabled: input.confirmationEnabled,
    ui: { detailsOpen: input.ui.detailsOpen },
  };
}
