import { BleProfileValidationError, StrictBleProfileCodec } from './codec';
import type { BleProfile } from './types';

export type BleProfileReadiness = 'draft' | 'connectable' | 'controllable';

export interface BleProfileReadinessResult {
  state: BleProfileReadiness;
  valid: boolean;
  missing: readonly string[];
  reasons: readonly string[];
  nextStep: string;
  profile?: BleProfile;
}

function result(state: BleProfileReadiness, missing: string[], reasons: string[], profile?: BleProfile): BleProfileReadinessResult {
  const nextStep = state === 'draft' ? '\u8865\u5168\u8fde\u63a5\u914d\u7f6e\u5e76\u4fdd\u5b58' : state === 'connectable' ? '\u5b8c\u6210\u9996\u6b21\u4f4e\u5f3a\u5ea6\u6d4b\u8bd5\u5e76\u786e\u8ba4\u505c\u6b62\u6307\u4ee4' : '\u53ef\u8fde\u63a5\u540e\u8fdb\u884c\u4f4e\u5f3a\u5ea6\u6d4b\u8bd5';
  return { state, valid: missing.length === 0 && reasons.length === 0, missing, reasons, nextStep, ...(profile ? { profile } : {}) };
}

export function validateProfileDraft(input: unknown): BleProfileReadinessResult {
  if (input === undefined || input === null || input === '') return result('draft', ['\u8bf7\u63d0\u4f9b\u914d\u7f6e'], []);
  try { const profile = new StrictBleProfileCodec().validate(input); return result('draft', [], [], profile); }
  catch (error) { return result('draft', [], [error instanceof Error ? error.message : '\u84dd\u7259\u914d\u7f6e\u65e0\u6cd5\u8bfb\u53d6'], undefined); }
}

export function validateConnectionProfile(input: unknown): BleProfileReadinessResult {
  const draft = validateProfileDraft(input);
  if (!draft.profile || draft.reasons.length > 0) return draft;
  return result('connectable', [], [], draft.profile);
}

export function validateControlProfile(input: unknown): BleProfileReadinessResult {
  const connection = validateConnectionProfile(input);
  if (!connection.profile || connection.reasons.length > 0) return connection;
  try {
    const codec = new StrictBleProfileCodec();
    const stop = codec.encodeStop(connection.profile);
    if (stop.length === 0) throw new BleProfileValidationError('\u505c\u6b62\u6307\u4ee4\u4e0d\u80fd\u4e3a\u7a7a\u3002');
    codec.encodeVibrate(connection.profile, 0.1);
    return result('connectable', [], [], connection.profile);
  } catch (error) {
    return result('connectable', [], [error instanceof Error ? error.message : '\u63a7\u5236\u6307\u4ee4\u65e0\u6548'], connection.profile);
  }
}

export function getProfileReadiness(input: unknown, locallyVerified = false): BleProfileReadinessResult {
  const control = validateControlProfile(input);
  if (!control.profile || control.reasons.length > 0) return control;
  if (!locallyVerified) return result('connectable', [], ['\u9996\u6b21\u4f4e\u5f3a\u5ea6\u6d4b\u8bd5\u524d\u9700\u8981\u4eba\u5de5\u786e\u8ba4\u6700\u7ec8\u6307\u4ee4\u3002'], control.profile);
  return result('controllable', [], [], control.profile);
}
