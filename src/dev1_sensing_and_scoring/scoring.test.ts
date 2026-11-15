/**
 * Unit tests for ErgoGotchi Scoring and State Engine.
 */

import { describe, it, expect } from 'vitest';
import { step, createInitialState, NORMAL_PARAMS, DEMO_PARAMS, DIFFICULTY_PRESETS } from './scoring';
import { BiometricSignals } from '../types';

const PERFECT_SIGNALS: BiometricSignals = {
  forward_head: 0.02,
  head_drop: 0.02,
  head_pitch_deg: 2.0,
  lean_in: 0.02,
  shoulder_tilt_deg: 1.0,
  blink_rate_1m: 16,
  head_yaw_deg: 0.0,
};

const SEVERE_SLOUCH_SIGNALS: BiometricSignals = {
  forward_head: 0.22,      // Above 0.20 -> 1.0 strain
  head_drop: 0.26,
  head_pitch_deg: 34.0,
  lean_in: 0.34,
  shoulder_tilt_deg: 15.0,
  blink_rate_1m: 1,
  head_yaw_deg: 0.0,
};

describe('ErgoGotchi Scoring Engine', () => {
  it('stays in CALIBRATING if not calibrated', () => {
    let state = createInitialState();
    state = step(state, PERFECT_SIGNALS, 1.0, NORMAL_PARAMS, false, true);
    expect(state.state).toBe('CALIBRATING');
  });

  it('switches to AWAY and freezes HP when face is missing', () => {
    let state = createInitialState();
    state.hp = 85;
    state.lastPresentAt = Date.now() - 4000; // 4 seconds ago
    state = step(state, null, 1.0, NORMAL_PARAMS, true, false);
    expect(state.state).toBe('AWAY');
    expect(state.hp).toBe(85);
  });

  it('detects upright posture and enters THRIVING', () => {
    let state = createInitialState();
    state.hp = 90;
    state = step(state, PERFECT_SIGNALS, 1.0, NORMAL_PARAMS, true, true);
    expect(state.strainIndex).toBeLessThan(0.3);
    expect(state.state).toBe('THRIVING');
  });

  it('supports customizable difficulty dwell timings (Strict 0.5s, Normal 1.5s, Forgiving 3.0s)', () => {
    // 1. Strict mode (0.5s dwell): Slouches immediately on 1st second (1s >= 0.5s)
    let strictState = createInitialState();
    strictState.hp = 70;
    strictState = step(strictState, SEVERE_SLOUCH_SIGNALS, 1.0, DIFFICULTY_PRESETS.strict, true, true);
    expect(strictState.state).toBe('SLOUCHING');

    // 2. Normal mode (1.5s dwell): Stays NEUTRAL at 1.0s, slouches at 2.0s
    let normalState = createInitialState();
    normalState.hp = 70;
    normalState = step(normalState, SEVERE_SLOUCH_SIGNALS, 1.0, DIFFICULTY_PRESETS.normal, true, true);
    expect(normalState.state).toBe('NEUTRAL');
    normalState = step(normalState, SEVERE_SLOUCH_SIGNALS, 1.0, DIFFICULTY_PRESETS.normal, true, true);
    expect(normalState.state).toBe('SLOUCHING');

    // 3. Forgiving mode (3.0s dwell): Stays NEUTRAL at 2.0s, slouches at 3.0s
    let forgivingState = createInitialState();
    forgivingState.hp = 70;
    forgivingState = step(forgivingState, SEVERE_SLOUCH_SIGNALS, 1.0, DIFFICULTY_PRESETS.forgiving, true, true);
    expect(forgivingState.state).toBe('NEUTRAL');
    forgivingState = step(forgivingState, SEVERE_SLOUCH_SIGNALS, 1.0, DIFFICULTY_PRESETS.forgiving, true, true);
    expect(forgivingState.state).toBe('NEUTRAL');
    forgivingState = step(forgivingState, SEVERE_SLOUCH_SIGNALS, 1.0, DIFFICULTY_PRESETS.forgiving, true, true);
    expect(forgivingState.state).toBe('SLOUCHING');
  });

  it('applies slightly more forgiving thresholds to accommodate natural micro-shifts', () => {
    let state = createInitialState();
    state.hp = 85;

    // forward_head = 0.07 (previously started strain at 0.06; now zero strain under 0.08)
    const naturalShiftSignals: BiometricSignals = {
      ...PERFECT_SIGNALS,
      forward_head: 0.07,
      head_pitch_deg: 13.0, // starts strain at 14°
    };

    state = step(state, naturalShiftSignals, 1.0, NORMAL_PARAMS, true, true);
    expect(state.strainIndex).toBeLessThan(0.1);
    expect(state.state).toBe('THRIVING');
  });

  it('decays HP under high strain and enters WILTED when HP < 20', () => {
    let state = createInitialState();
    state.hp = 25;
    
    // Run two high-strain steps
    state = step(state, SEVERE_SLOUCH_SIGNALS, 1.0, NORMAL_PARAMS, true, true);
    state = step(state, SEVERE_SLOUCH_SIGNALS, 1.0, NORMAL_PARAMS, true, true);
    expect(state.hp).toBeLessThan(20);
    expect(state.state).toBe('WILTED');
  });

  it('triggers one-shot revive backflip when recovering posture', () => {
    let state = createInitialState();
    state.state = 'SLOUCHING';
    state.hp = 85;
    
    // User sits upright
    state = step(state, PERFECT_SIGNALS, 1.0, NORMAL_PARAMS, true, true);
    expect(state.isReviving).toBe(true);
    expect(state.state).toBe('THRIVING');
  });

  it('fires intervention request on sustained slouch once HP reaches warnAtHp', () => {
    let state = createInitialState();
    state.state = 'SLOUCHING';
    state.slouchDwellAccumulator = DIFFICULTY_PRESETS.normal.slouchDwellSeconds;
    state.hp = DIFFICULTY_PRESETS.normal.warnAtHp; // exactly at warning threshold
    state.speechCooldownTimer = 0;

    // Run sustained slouch duration (4s in normal mode)
    for (let i = 0; i < 4; i++) {
      state = step(state, SEVERE_SLOUCH_SIGNALS, 1.0, DIFFICULTY_PRESETS.normal, true, true);
    }

    expect(state.triggerIntervention).toBe(true);
    expect(state.interventionReason).toBe('SLOUCH');
    expect(state.speechCooldownTimer).toBe(DIFFICULTY_PRESETS.normal.speechCooldownSeconds);
  });

  it('respects 20-degree Yaw guard by ignoring forward head drift when looking at secondary monitors', () => {
    let state = createInitialState();
    state.hp = 85;
    
    // User turns head > 20 deg (e.g. 22 deg)
    const turnedSignals: BiometricSignals = {
      ...PERFECT_SIGNALS,
      forward_head: 0.19, // Would normally cause heavy strain
      head_yaw_deg: 22.0, // Multi-monitor guard active (> 20 deg)
    };
    
    state = step(state, turnedSignals, 1.0, NORMAL_PARAMS, true, true);
    expect(state.strainIndex).toBeLessThan(0.3);
    expect(state.state).toBe('THRIVING');
  });

  it('nudges with LOW_BLINK and accelerates HP drain exponentially during prolonged staring', () => {
    let state = createInitialState();
    state.hp = 100;
    const lowBlinkSignals = { ...PERFECT_SIGNALS, blink_rate_1m: 4 }; // Below 7 threshold
    let nudged = false;

    // Step 30 seconds: initial drain is gentle, but non-zero
    for (let i = 0; i < 30; i++) {
      state = step(state, lowBlinkSignals, 1.0, DIFFICULTY_PRESETS.normal, true, true);
      if (state.triggerIntervention && state.interventionReason === 'LOW_BLINK') {
        nudged = true;
      }
    }

    expect(nudged).toBe(true);
    // Over the first 30 seconds, HP has started draining gently (around ~1-2 HP lost)
    expect(state.hp).toBeLessThan(100);
    expect(state.hp).toBeGreaterThan(97);

    const hpAfter30s = state.hp;

    // Step another 60 seconds (minute 1-2): exponential drain rate doubles and drains faster
    for (let i = 0; i < 60; i++) {
      state = step(state, lowBlinkSignals, 1.0, DIFFICULTY_PRESETS.normal, true, true);
    }
    const dropInSecondMinute = hpAfter30s - state.hp;
    // Drop in minute 1-2 is significantly greater than first 30s rate
    expect(dropInSecondMinute).toBeGreaterThan(1.5);
  });

  it('does not warn about slouching while HP is still above warnAtHp', () => {
    let state = createInitialState();
    state.state = 'SLOUCHING';
    state.slouchDwellAccumulator = DIFFICULTY_PRESETS.normal.slouchDwellSeconds;
    state.hp = 100;
    state.speechCooldownTimer = 0;
    let firstWarnHp: number | null = null;
    for (let i = 0; i < 30 && firstWarnHp === null; i++) {
      state = step(state, SEVERE_SLOUCH_SIGNALS, 1.0, DIFFICULTY_PRESETS.normal, true, true);
      if (state.triggerIntervention && state.interventionReason === 'SLOUCH') firstWarnHp = state.hp;
    }
    expect(firstWarnHp).not.toBeNull();
    expect(firstWarnHp!).toBeLessThanOrEqual(DIFFICULTY_PRESETS.normal.warnAtHp);
  });
});
