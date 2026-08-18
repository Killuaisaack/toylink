import {
  ABSOLUTE_MAX_DURATION_MS,
  ABSOLUTE_MAX_INTENSITY,
  DEFAULT_MAX_DURATION_MS,
  DEFAULT_MAX_INTENSITY,
} from './constants';
import type { AppliedVibration } from './commands';

export interface SafetyLimits {
  maxIntensity: number;
  maxDurationMs: number;
}

export function normalizeLimits(value: Partial<SafetyLimits> | undefined): SafetyLimits {
  const intensity = value?.maxIntensity;
  const duration = value?.maxDurationMs;
  return {
    maxIntensity: typeof intensity === 'number' && Number.isFinite(intensity)
      ? Math.min(ABSOLUTE_MAX_INTENSITY, Math.max(0.01, intensity))
      : DEFAULT_MAX_INTENSITY,
    maxDurationMs: typeof duration === 'number' && Number.isSafeInteger(duration)
      ? Math.min(ABSOLUTE_MAX_DURATION_MS, Math.max(100, duration))
      : DEFAULT_MAX_DURATION_MS,
  };
}

export function applySafetyLimits(intensity: number, durationMs: number, limits: SafetyLimits): AppliedVibration {
  const safeLimits = normalizeLimits(limits);
  const appliedIntensity = Math.min(intensity, safeLimits.maxIntensity, ABSOLUTE_MAX_INTENSITY);
  const appliedDuration = Math.min(durationMs, safeLimits.maxDurationMs, ABSOLUTE_MAX_DURATION_MS);
  return {
    requestedIntensity: intensity,
    requestedDurationMs: durationMs,
    intensity: appliedIntensity,
    durationMs: appliedDuration,
    wasLimited: appliedIntensity !== intensity || appliedDuration !== durationMs,
  };
}
