/**
 * Pure scoring function and ergonomic state machine.
 * Operates entirely on-device to ensure sub-millisecond reactions and full offline resilience.
 */

import { 
  BiometricSignals, 
  DifficultyLevel,
  PetState, 
  ScoringParams, 
  ScoringState 
} from '../types';

export const DIFFICULTY_PRESETS: Record<DifficultyLevel, ScoringParams> = {
  strict: {
    slouchDwellSeconds: 0.5,    // Demanding 0.5s posture reaction
    decayRate: 4.0,
    recoverRate: 6.0,
    sustainedSlouchSeconds: 2.0,
    speechCooldownSeconds: 20.0,
    lowBlinkWindowSeconds: 20.0,
    warnAtHp: 55,
  },
  normal: {
    slouchDwellSeconds: 1.5,    // Standard balanced 1.5s reaction
    decayRate: 2.5,
    recoverRate: 4.0,
    sustainedSlouchSeconds: 4.0,
    speechCooldownSeconds: 30.0,
    lowBlinkWindowSeconds: 30.0,
    warnAtHp: 50,
  },
  forgiving: {
    slouchDwellSeconds: 3.0,    // Relaxed 3.0s reaction
    decayRate: 0.8,
    recoverRate: 2.0,
    sustainedSlouchSeconds: 10.0,
    speechCooldownSeconds: 60.0,
    lowBlinkWindowSeconds: 45.0,
    warnAtHp: 40,
  },
};

export const NORMAL_PARAMS: ScoringParams = DIFFICULTY_PRESETS.normal;
export const DEMO_PARAMS: ScoringParams = DIFFICULTY_PRESETS.strict;

export function createInitialState(): ScoringState {
  return {
    hp: 100,
    state: 'CALIBRATING',
    strainIndex: 0.0,
    slouchDwellAccumulator: 0.0,
    sustainedSlouchTimer: 0.0,
    speechCooldownTimer: 0.0,
    lowBlinkTimer: 0.0,
    lowBlinkAccumulator: 0.0,
    lastPresentAt: Date.now(),
    triggerIntervention: false,
    isReviving: false,
  };
}

/** Clamp helper */
function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/** Normalized 0 to 1 score calculation */
function scoreRange(val: number, start: number, full: number): number {
  if (full === start) return 0;
  const clamped = clamp(val, Math.min(start, full), Math.max(start, full));
  return (clamped - start) / (full - start);
}

/**
 * Pure state step function.
 * Called once per second or per frame with delta-time dt (in seconds).
 */
export function step(
  prev: ScoringState,
  signals: BiometricSignals | null,
  dt: number,
  params: ScoringParams,
  isCalibrated: boolean,
  isPresent: boolean
): ScoringState {
  const next: ScoringState = { ...prev, triggerIntervention: false, isReviving: false };
  const now = Date.now();

  // 1. Guard against uncalibrated state
  if (!isCalibrated) {
    next.state = 'CALIBRATING';
    return next;
  }

  // 2. Presence tracking: 3s without face marks AWAY and freezes HP
  if (isPresent) {
    next.lastPresentAt = now;
  } else if (now - next.lastPresentAt > 3000) {
    next.state = 'AWAY';
    next.slouchDwellAccumulator = 0;
    return next;
  }

  if (!signals) {
    return next;
  }

  // 3. Compute individual signal strain scores (0 to 1)
  // Guard: Yaw > 20 deg suppresses forward_head check to prevent false turns (multi-monitor guard)
  const forwardHeadScore = Math.abs(signals.head_yaw_deg) > 20 
    ? 0.0 
    : scoreRange(signals.forward_head, 0.08, 0.20); // slightly more forgiving (0.08 to 0.20)

  const headDropScore = scoreRange(signals.head_drop, 0.10, 0.24); // slightly more forgiving (0.10 to 0.24)
  const headPitchScore = scoreRange(signals.head_pitch_deg, 14, 32); // slightly more forgiving (14° to 32°)
  const leanInScore = scoreRange(signals.lean_in, 0.12, 0.32); // slightly more forgiving (0.12 to 0.32)
  const tiltScore = scoreRange(signals.shoulder_tilt_deg, 5, 13); // slightly more forgiving (5° to 13°)

  // Invert blink score: <7 starts strain, <=2 is 1.0 strain
  const blinkScore = scoreRange(signals.blink_rate_1m, 7, 2);

  // Map scores to signal names to identify worst culprit for stretch cues
  const scoreMap = [
    { name: 'forward_head', score: forwardHeadScore },
    { name: 'head_drop', score: headDropScore },
    { name: 'head_pitch', score: headPitchScore },
    { name: 'lean_in', score: leanInScore },
    { name: 'tilt', score: tiltScore },
    // Kept below the 0.5 decay threshold: low blinking earns a LOW_BLINK nudge + optical drain
    { name: 'blink_rate', score: 0.45 * blinkScore },
  ];

  // Maximum rule: single worst strain dictates strain index
  let worst = scoreMap[0];
  for (const s of scoreMap) {
    if (s.score > worst.score) {
      worst = s;
    }
  }

  next.strainIndex = clamp(worst.score, 0.0, 1.0);
  next.worstSignal = worst.name;

  // 4. Slouch dwell time tracking
  if (next.strainIndex >= 0.5) {
    next.slouchDwellAccumulator += dt;
  } else {
    next.slouchDwellAccumulator = Math.max(0, next.slouchDwellAccumulator - dt * 1.5);
  }

  // 5. HP decay / recover logic
  if (next.strainIndex >= 0.5) {
    next.hp = Math.max(0, next.hp - params.decayRate * next.strainIndex * dt);
  } else if (next.strainIndex < 0.3 && signals.blink_rate_1m >= 7) {
    next.hp = Math.min(100, next.hp + params.recoverRate * dt);
  }
  // Between 0.3 and 0.5: HP holds without flickering

  // 5b. Optical Fixation & Low Blink Exponential Drain:
  // Staring (<7 blinks/min) starts draining HP very slowly, accelerating exponentially every minute
  if (signals.blink_rate_1m < 7) {
    next.lowBlinkAccumulator = (next.lowBlinkAccumulator ?? 0) + dt;
    const minutesUnder = next.lowBlinkAccumulator / 60.0;
    // Base 0.05 HP/s (~3 HP in first min), doubling each minute under threshold
    const blinkDrainRate = 0.05 * Math.pow(2, minutesUnder);
    next.hp = Math.max(0, next.hp - blinkDrainRate * dt);
  } else {
    // Normal blinking resumes -> smoothly drain optical fatigue accumulator
    next.lowBlinkAccumulator = Math.max(0, (next.lowBlinkAccumulator ?? 0) - dt * 2.0);
  }

  // 6. State Machine: evaluated in strict priority order
  const isSlouching = next.slouchDwellAccumulator >= params.slouchDwellSeconds;
  let targetState: PetState = 'NEUTRAL';

  if (next.hp < 20) {
    targetState = 'WILTED';
  } else if (isSlouching) {
    targetState = 'SLOUCHING';
  } else if (next.hp >= 80 && next.strainIndex < 0.3) {
    targetState = 'THRIVING';
  } else {
    targetState = 'NEUTRAL';
  }

  // Check for Revive One-Shot Animation (leaving SLOUCHING/WILTED for good posture)
  if ((prev.state === 'SLOUCHING' || prev.state === 'WILTED') && (targetState === 'THRIVING' || targetState === 'NEUTRAL')) {
    next.isReviving = true;
  }
  next.state = targetState;

  // 7. Speech Bubble Cooldown and Triggers
  next.speechCooldownTimer = Math.max(0, next.speechCooldownTimer - dt);

  if (next.state === 'SLOUCHING') {
    next.sustainedSlouchTimer += dt;
    if (
      next.sustainedSlouchTimer >= params.sustainedSlouchSeconds &&
      next.speechCooldownTimer <= 0 &&
      next.hp <= params.warnAtHp
    ) {
      next.triggerIntervention = true;
      next.interventionReason = 'SLOUCH';
      next.sustainedSlouchTimer = 0;
      next.speechCooldownTimer = params.speechCooldownSeconds;
    }
  } else {
    next.sustainedSlouchTimer = 0;
  }

  // Low blink intervention trigger (<7 blinks/min triggers cute comic speech bubble nudge)
  if (signals.blink_rate_1m < 7 && next.strainIndex < 0.5) {
    next.lowBlinkTimer += dt;
    if (next.lowBlinkTimer >= params.lowBlinkWindowSeconds && next.speechCooldownTimer <= 0) {
      next.triggerIntervention = true;
      next.interventionReason = 'LOW_BLINK';
      next.lowBlinkTimer = 0;
      next.speechCooldownTimer = params.speechCooldownSeconds;
    }
  } else {
    next.lowBlinkTimer = 0;
  }

  return next;
}
