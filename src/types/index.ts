/**
 * Core type definitions for ErgoGotchi Telemetry, Scoring, and Pet State.
 * Strictly adheres to sunhacks 2026 ErgoGotchi Architecture Specification.
 */

export type PetState = 
  | 'CALIBRATING' 
  | 'AWAY' 
  | 'THRIVING' 
  | 'NEUTRAL' 
  | 'SLOUCHING' 
  | 'WILTED';

export type TriggerReason = 
  | 'SLOUCH' 
  | 'LOW_BLINK' 
  | 'LONG_SESSION' 
  | 'RECOVERED';

export type StretchCue = 
  | 'CHIN_TUCK' 
  | 'SHOULDER_ROLL' 
  | 'SIT_BACK' 
  | 'LOOK_AWAY' 
  | 'STAND_UP' 
  | 'NONE';

export type Severity = 'NUDGE' | 'WARNING';
export type InterventionSource = 'gemini' | 'cache' | 'canned';

/** Raw biometric posture signals relative to baseline */
export interface BiometricSignals {
  forward_head: number;      // (F/W) / (F0/W0) - 1
  head_drop: number;         // 1 - (D/W) / (D0/W0)
  head_pitch_deg: number;    // P - P0
  lean_in: number;           // W/W0 - 1
  shoulder_tilt_deg: number; // |T - T0|
  blink_rate_1m: number;     // Blinks in trailing 60s
  head_yaw_deg: number;      // Guard: Yaw > 15 deg
}

/** Calibrated zero-point baseline from 5-second upright stance */
export interface BaselineCalibration {
  w0: number;               // Shoulder width
  f0: number;               // Face width (ear-to-ear)
  d0: number;               // Ear-to-shoulder vertical distance
  t0: number;               // Shoulder line angle
  p0: number;               // Head pitch
  openEyeBlinkScore: number;// Baseline open eye blink blendshape score
  blinkThreshold: number;   // Halfway between open eye score and 0.6
  calibratedAt: string;
}

/** State Machine & HP decay configuration parameters */
export interface ScoringParams {
  slouchDwellSeconds: number;     // Time at high strain before pet slouches (5s normal, 1.5s demo)
  decayRate: number;              // HP decay per second at full strain (0.1 normal, 6.0 demo)
  recoverRate: number;            // HP recover per second at low strain (0.05 normal, 8.0 demo)
  sustainedSlouchSeconds: number; // Slouch duration before speech bubble trigger (30s normal, 3s demo)
  speechCooldownSeconds: number;  // Cooldown between speech bubbles (300s normal, 15s demo)
  lowBlinkWindowSeconds: number;  // Low-blink trigger window (60s normal, 15s demo)
  warnAtHp: number;               // Slouch warning only fires once HP has dropped to this level
}

/** Scoring State maintained across frames */
export interface ScoringState {
  hp: number;                     // 0 to 100
  state: PetState;
  strainIndex: number;            // 0 to 1
  slouchDwellAccumulator: number; // Dwell time at high strain
  sustainedSlouchTimer: number;   // Accumulated time for speech trigger
  speechCooldownTimer: number;    // Remaining cooldown
  lowBlinkTimer: number;          // Accumulated low-blink duration
  lastPresentAt: number;          // Timestamp of last detected face
  triggerIntervention: boolean;   // Flag to emit intervention request
  interventionReason?: TriggerReason;
  worstSignal?: string;
  isReviving: boolean;            // One-shot backflip flag
}

/** Contract 1: Telemetry (App -> Server, 1 Hz) */
export interface TelemetryMessage {
  type: 'telemetry';
  v: 1;
  session_id: string;
  ts: string;
  present: boolean;
  calibrated: boolean;
  forward_head: number | null;
  head_drop: number | null;
  head_pitch_deg: number | null;
  lean_in: number | null;
  shoulder_tilt_deg: number | null;
  blink_rate_1m: number | null;
  strain_index: number;
  hp: number;
  state: PetState;
}

/** Contract 2: Intervention Request (App -> Server) */
export interface InterventionRequestMessage {
  type: 'intervention_request';
  v: 1;
  request_id: string;
  session_id: string;
  reason: TriggerReason;
  context: {
    minutes_in_session: number;
    worst_signal: string;
    strain_index: number;
    blink_rate_1m: number;
    hp: number;
  };
}

/** Contract 3: Intervention (Server -> App) */
export interface InterventionMessage {
  type: 'intervention';
  v: 1;
  request_id: string;
  text: string;
  cue: StretchCue;
  instruction?: string;
  severity: Severity;
  source: InterventionSource;
}
