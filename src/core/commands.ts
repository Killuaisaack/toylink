export type ToyCommand =
  | { action: 'vibrate'; intensity: number; durationMs: number; commandId: string; createdAt: number }
  | { action: 'stop'; commandId: string; createdAt: number };

export type CommandOrigin = 'manual' | 'ai' | 'system';

export interface AppliedVibration {
  requestedIntensity: number;
  requestedDurationMs: number;
  intensity: number;
  durationMs: number;
  wasLimited: boolean;
}
