/**
 * Pure scoring function and ergonomic state machine.
 * Operates entirely on-device to ensure sub-millisecond reactions and full offline resilience.
 */

import { 
  BiometricSignals, 
  PetState, 
  ScoringParams, 
  ScoringState 
} from '../types';

export const NORMAL_PARAMS: ScoringParams = {
  slouchDwellSeconds: 5.0,
  decayRate: 0.10,           // Empties full HP bar in ~17 mins at 1.0 strain
  recoverRate: 0.05,
  sustainedSlouchSeconds: 30.0,
  speechCooldownSeconds: 300.0,
  lowBlinkWindowSeconds: 60.0,
};

export const DEMO_PARAMS: ScoringParams = {
  slouchDwellSeconds: 1.5,
  decayRate: 6.0,            // Empties bar in ~17s for live 3-min hackathon pitch
  recoverRate: 8.0,          // Quick 12s recovery for judge walkthrough
  sustainedSlouchSeconds: 3.0,
  speechCooldownSeconds: 15.0,
  lowBlinkWindowSeconds: 15.0,
};

export function createInitialState(): ScoringState {
  return {
    hp: 100,
    state: 'CALIBRATING',
    strainIndex: 0.0,
    slouchDwellAccumulator: 0.0,
    sustainedSlouchTimer: 0.0,
    speechCooldownTimer: 0.0,
    lowBlinkTimer: 0.0,
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
  // Guard: Yaw > 15 deg suppresses forward_head check to prevent false turns
  const forwardHeadScore = Math.abs(signals.head_yaw_deg) > 15 
    ? 0.0 
    : scoreRange(signals.forward_head, 0.06, 0.18);

  const headDropScore = scoreRange(signals.head_drop, 0.08, 0.22);
  const headPitchScore = scoreRange(signals.head_pitch_deg, 12, 30);
  const leanInScore = scoreRange(signals.lean_in, 0.10, 0.30);
  const tiltScore = scoreRange(signals.shoulder_tilt_deg, 4, 12);

  // Invert blink score: <8 starts strain, <=3 is 1.0 strain
  const blinkScore = scoreRange(signals.blink_rate_1m, 8, 3);

  // Map scores to signal names to identify worst culprit for stretch cues
  const scoreMap = [
    { name: 'forward_head', score: forwardHeadScore },
    { name: 'head_drop', score: headDropScore },
    { name: 'head_pitch', score: headPitchScore },
    { name: 'lean_in', score: leanInScore },
    { name: 'tilt', score: tiltScore },
    // Kept below the 0.5 decay threshold: low blinking earns a LOW_BLINK nudge, never HP loss on its own
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
  } else if (next.strainIndex < 0.3) {
    next.hp = Math.min(100, next.hp + params.recoverRate * dt);
  }
  // Between 0.3 and 0.5: HP holds without flickering

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
    if (next.sustainedSlouchTimer >= params.sustainedSlouchSeconds && next.speechCooldownTimer <= 0) {
      next.triggerIntervention = true;
      next.interventionReason = 'SLOUCH';
      next.sustainedSlouchTimer = 0;
      next.speechCooldownTimer = params.speechCooldownSeconds;
    }
  } else {
    next.sustainedSlouchTimer = 0;
  }

  // Low blink intervention trigger
  if (signals.blink_rate_1m < 8 && next.strainIndex < 0.5) {
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
