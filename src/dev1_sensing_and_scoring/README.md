# 👁️ Developer 1: Sensing, Biometrics & Scoring Engine
> **Target Tracks Supported**: Future of Work (JFFVentures), Gaming  
> **Primary Language**: TypeScript / WebAssembly / Vitest  
> **Directory**: `src/dev1_sensing_and_scoring/`

---

## 🎯 Your Mission Tonight
You own the **Edge Biometrics & Landmark Tracking Pipeline** and the **On-Device Scoring State Machine**. Your goal is to make posture detection feel **instant, reliable, and immune to false positives** across different team members, lighting conditions, and laptop angles.

---

## 📂 Files You Own
- **`visionPipeline.ts`**: MediaPipe FaceLandmarker (478 pts) & PoseLandmarker (33 pts), 5-second upright calibration, blendshape blink tracking, and 1-second median smoothing.
- **`scoring.ts`**: Pure function `step(prev, signals, dt, params, isCalibrated, isPresent)` calculating strain index, HP decay/recovery, dwell timers, and one-shot backflip revivals.
- **`scoring.test.ts`**: Vitest unit test suite covering state transitions, demo mode timings, and signal guards.

---

## ⚡ How to Work & Test Independently
You do **not** need the cloud database or Electron running to test and tune your signals.

```bash
# Run your automated unit test suite (runs in ~600ms)
npm test

# Run Vite in your browser to test live camera landmark tracking
npm run dev
# Open http://localhost:5173
```

---

## 🧮 Biometric Math & Calibration Cheatsheet

### 1. Calibrated Baseline Zero-Point (Recorded in first 5 seconds)
- $W_0$: Shoulder width (distance between Pose landmarks 11 & 12)
- $F_0$: Face width (ear-to-ear distance between landmarks 7 & 8 or Face landmarks 234 & 454)
- $D_0$: Vertical distance from ear midpoint down to shoulder midpoint
- $T_0$: Shoulder line angle in degrees
- $P_0$: Head pitch relative to camera horizontal
- $\text{OpenEyeBlinkScore}$: Median open-eye blink score (sets blink threshold at $(\text{openEye} + 0.6) / 2$)

### 2. Relative Posture Signals & Strain Clamping
| Signal | Mathematical Formula | Strain Starts (0.0) | Full Strain (1.0) | Guard Logic |
| :--- | :--- | :--- | :--- | :--- |
| **`forward_head`** | $\frac{F / W}{F_0 / W_0} - 1$ | 0.06 | 0.18 | Suppressed if $\lvert \text{Yaw} \rvert > 15^\circ$ (turning head doesn't trigger false forward lean) |
| **`head_drop`** | $1 - \frac{D / W}{D_0 / W_0}$ | 0.08 | 0.22 | Measures shoulder hunching toward ears |
| **`head_pitch`** | $P - P_0$ | $12^\circ$ down | $30^\circ$ down | Eyelid pause if pitch $> 20^\circ$ down |
| **`lean_in`** | $\frac{W}{W_0} - 1$ | 0.10 | 0.30 | Catches whole upper body creeping into display |
| **`shoulder_tilt`** | $\lvert T - T_0 \rvert$ | $4^\circ$ | $12^\circ$ | Catches leaning sideways on an elbow |
| **`blink_rate_1m`** | Rolling 60s count | $< 8\text{ bpm}$ | $\le 3\text{ bpm}$ | Weighted at $0.6 \times \text{blinkScore}$ |

### 3. The Maximum Rule
$$\text{strainIndex} = \max(\text{forward\_head}_s,\ \text{head\_drop}_s,\ \text{head\_pitch}_s,\ \text{lean\_in}_s,\ \text{tilt}_s,\ 0.6 \times \text{blink}_s)$$

---

## 🛠️ Tonight's Fine-Tuning Checklist
1. **Multi-User Calibration Test**: Have all 3 team members sit in front of the camera and calibrate. Ensure someone wearing glasses has their blinks accurately registered.
2. **Laptop vs Desk Angle Check**: Test when the laptop is sitting on a low table vs an elevated stand. Because we measure relative drift ($\Delta$), it should remain stable.
3. **Presence Verification**: Step out of the camera frame for 3 seconds. Verify that Bobi switches to `AWAY` and freezes HP without draining to zero.
4. **Demo Mode Timing Validation**: In Demo Mode (`DEMO_PARAMS`), ensure slouch dwell triggers the puddle animation within $1.5\text{s}$ and triggers Gemini speech within $3\text{s}$.
