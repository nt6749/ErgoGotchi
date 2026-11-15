/**
 * Unit tests for ErgoGotchi Scoring and State Engine.
 */

import { describe, it, expect } from 'vitest';
import { step, createInitialState, NORMAL_PARAMS, DEMO_PARAMS } from './scoring';
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
  forward_head: 0.20,      // Above 0.18 -> 1.0 strain
  head_drop: 0.24,
  head_pitch_deg: 32.0,
  lean_in: 0.32,
  shoulder_tilt_deg: 14.0,
  blink_rate_1m: 2,
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

  it('slouches after dwell time in normal mode', () => {
    let state = createInitialState();
    state.hp = 70;
    
    // Step 4 seconds (below 5s dwell)
    for (let i = 0; i < 4; i++) {
      state = step(state, SEVERE_SLOUCH_SIGNALS, 1.0, NORMAL_PARAMS, true, true);
      expect(state.state).toBe('NEUTRAL');
    }
    
    // 5th second -> crosses 5s dwell
    state = step(state, SEVERE_SLOUCH_SIGNALS, 1.0, NORMAL_PARAMS, true, true);
    expect(state.state).toBe('SLOUCHING');
    expect(state.worstSignal).toBe('forward_head');
  });

  it('triggers fast 1.5s slouch reaction in DEMO mode', () => {
    let state = createInitialState();
    state.hp = 70;
    
    // 1st second
    state = step(state, SEVERE_SLOUCH_SIGNALS, 1.0, DEMO_PARAMS, true, true);
    expect(state.state).toBe('NEUTRAL');
    
    // Next 1 second (total 2s > 1.5s demo dwell)
    state = step(state, SEVERE_SLOUCH_SIGNALS, 1.0, DEMO_PARAMS, true, true);
    expect(state.state).toBe('SLOUCHING');
  });

  it('decays HP under high strain and enters WILTED when HP < 20', () => {
    let state = createInitialState();
    state.hp = 25;
    
    // Run several high-strain steps in DEMO mode
    state = step(state, SEVERE_SLOUCH_SIGNALS, 1.0, DEMO_PARAMS, true, true);
    expect(state.hp).toBeLessThan(20);
    expect(state.state).toBe('WILTED');
  });

  it('triggers one-shot revive backflip when recovering posture', () => {
    let state = createInitialState();
    state.state = 'SLOUCHING';
    state.hp = 85;
    
    // User sits upright
    state = step(state, PERFECT_SIGNALS, 1.0, DEMO_PARAMS, true, true);
    expect(state.isReviving).toBe(true);
    expect(state.state).toBe('THRIVING');
  });

  it('fires intervention request on sustained slouch in DEMO mode', () => {
    let state = createInitialState();
    state.state = 'SLOUCHING';
    state.slouchDwellAccumulator = DEMO_PARAMS.slouchDwellSeconds;
    state.hp = 60;
    state.speechCooldownTimer = 0;

    // In demo mode, sustained slouch trigger is 3s (3 steps of 1.0s)
    state = step(state, SEVERE_SLOUCH_SIGNALS, 1.0, DEMO_PARAMS, true, true);
    state = step(state, SEVERE_SLOUCH_SIGNALS, 1.0, DEMO_PARAMS, true, true);
    state = step(state, SEVERE_SLOUCH_SIGNALS, 1.0, DEMO_PARAMS, true, true);

    expect(state.triggerIntervention).toBe(true);
    expect(state.interventionReason).toBe('SLOUCH');
    expect(state.speechCooldownTimer).toBe(DEMO_PARAMS.speechCooldownSeconds);
  });

  it('respects Yaw guard by ignoring forward head drift when head is turned', () => {
    let state = createInitialState();
    state.hp = 85;
    
    // User turns head > 15 deg
    const turnedSignals: BiometricSignals = {
      ...PERFECT_SIGNALS,
      forward_head: 0.19, // Would normally be 1.0 strain
      head_yaw_deg: 22.0, // Guard active
    };
    
    state = step(state, turnedSignals, 1.0, NORMAL_PARAMS, true, true);
    expect(state.strainIndex).toBeLessThan(0.3);
    expect(state.state).toBe('THRIVING');
  });

  it('does not drain HP from low blinking alone, but nudges with LOW_BLINK', () => {
    let state = createInitialState();
    const noBlinks = { ...PERFECT_SIGNALS, blink_rate_1m: 0 };
    let nudged = false;
    for (let i = 0; i < 30; i++) {
      state = step(state, noBlinks, 1.0, DEMO_PARAMS, true, true);
      if (state.triggerIntervention && state.interventionReason === 'LOW_BLINK') nudged = true;
    }
    expect(state.hp).toBe(100);
    expect(state.state).not.toBe('WILTED');
    expect(nudged).toBe(true);
  });
});
