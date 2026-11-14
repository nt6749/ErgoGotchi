# 👾 ErgoGotchi (ErgoBuddy)
### Biometric Desktop Companion & Ergonomic Telemetry Engine
> **sunhacks 2026** · Target Tracks: **Best Mascot**, **Future of Work (JFFVentures)**, **Best Use of Gemini API**, **Best Use of Tiger Data**, **Best Gaming**, **Best Use of Vultr**, **SpaceXSI A-Team**.

[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](LICENSE)
[![Google Gemini](https://img.shields.io/badge/Google%20Gemini-Powered-blue)](https://ai.google.dev/)
[![Tiger Data](https://img.shields.io/badge/Tiger%20Data-TimescaleDB%20Hypertables-orange)](https://www.tigerdata.com/)
[![MediaPipe](https://img.shields.io/badge/MediaPipe-Edge%20Biometrics-cyan)](https://developers.google.com/mediapipe)

---

## 🌟 Executive Overview & Narrative
Developers and knowledge workers spend 10+ hours a day coding in front of screens, leading to chronic musculoskeletal strain, cervical nerve compression ("turtle neck"), and severe optical fixation fatigue. Traditional posture checkers feel like invasive corporate surveillance utilities or dry notification nags that users quickly dismiss or uninstall.

**ErgoGotchi** turns posture discipline into an emotional, delightful desktop game. Living natively along the bottom of your screen as a transparent, always-on-top desktop companion, your pet’s physical health points (HP), animations, and mood directly mirror your real-time posture. 

When you maintain flow with upright spinal alignment, ErgoGotchi energetically bounces and sports tiny headphones. Slumping or forward head drift causes the pet to visibly melt into a gelatinous, stressed puddle tapping on your glass. When ergonomic thresholds breach, **Google Gemini** steps in as your pet’s witty voice, serving context-aware comic roasts and clinically sound micro-stretches.

```
                  ┌────────────────────────────────────────┐
                  │          ErgoGotchi Architecture       │
                  └────────────────────────────────────────┘

     ┌─────────────────────── CLIENT EDGE (DESKTOP) ───────────────────────┐
     │                                                                     │
     │  Webcam (640x480) ──> MediaPipe Pose (33) & FaceLandmarker (478)    │
     │                            │                                        │
     │                            ▼                                        │
     │                 Relative Baseline Calibration                       │
     │       (5-second median zero-point: W0, F0, D0, T0, P0)              │
     │                            │                                        │
     │                            ▼                                        │
     │                 Pure TypeScript Scoring Engine                      │
     │                   (step() runs on-device, 0ms latency)              │
     │                            │                                        │
     │            ┌───────────────┴───────────────┐                        │
     │            ▼                               ▼                        │
     │    Mascot Sprite Window          Contract 1 (1 Hz Telemetry)        │
     │   (Transparent Electron)                   │                        │
     │   • Thriving (Backflip!)                   │                        │
     │   • Slouching Puddle                       │                        │
     │   • Wilted Ghost                           │                        │
     │   • Comic Speech Bubble                    │                        │
     └────────────────────────────────────────────┼────────────────────────┘
                                                  │
                                                  │ WebSockets (WSS)
                                                  ▼
     ┌────────────────────── CLOUD / BACKEND (VULTR) ──────────────────────┐
     │                                                                     │
     │                   FastAPI WebSocket & Relay Server                  │
     │                                    │                                │
     │            ┌───────────────────────┴────────────────────────┐       │
     │            ▼                                                ▼       │
     │   Tiger Data (TimescaleDB)                        Google Gemini API │
     │   • Hypertables (1-hr chunks)                     • Warm Line Cache │
     │   • Continuous Aggs (ergo_1min)                   • Structured JSON │
     │   • Strain Velocity: LAG()                        • Biomechanical   │
     │   • 90%+ Automatic Compression                      Stretch Cues    │
     └─────────────────────────────────────────────────────────────────────┘
```

---

## 🎯 Target Sponsor Tracks & Prize Alignment

| Sponsor Track | Prize / Category | Concrete ErgoGotchi Implementation |
| :--- | :--- | :--- |
| 🦫 **Best Mascot** | Buc-ee's + XPPen Tablets | A fully custom, animated cyber-blob with distinct physical states: bouncing walk, melted slouch puddle, ghost halo, interactive petting hearts, and a one-shot 360° backflip on posture recovery. |
| 💼 **Future of Work** | JFFVentures (Stream Decks + VC Pitch) | Privacy-preserving edge biometrics: zero video egress (frames processed in RAM and discarded); uses relative deviation from the user's calibrated baseline to prevent fatigue without HR surveillance. |
| ♊ **Best Use of Gemini API** | MLH Swag Kits & Honors | Gemini powers the pet’s personality engine with structured JSON responses, serving snappy, context-aware roasts and clinically grounded micro-stretch biomechanical cues. |
| 🐅 **Best Use of Tiger Data** | Stream Deck Mini | Ingests continuous 1 Hz telemetry into PostgreSQL hypertables; leverages `timescaledb.continuous` 1-minute materialized views (`ergo_1min`) and `LAG()` window functions to compute real-time strain velocity. |
| 🎮 **Best Gaming** | Gaming Track | Tamagotchi survival gameplay: 0–100 HP decay curve, level-ups, posture discipline XP, and death/revival state mechanics. |
| ☁️ **Best Use of Vultr** | IoT Kit / Cloud Awards | Full Docker Compose deployment blueprint provisioning TimescaleDB and the FastAPI telemetry service on Vultr High-Frequency Compute. |
| 🚀 **SpaceXSI A-Team** | Mechanical Keyboards | Automated Grok Bot webhook service generating personal, opt-in daily focus and posture summaries in Discord/Slack. |

---

## 🧮 Mathematical Formulation & Sensing Pipeline

To ensure scientific accuracy over naive pixel thresholds:

### 1. Relative Forward Head Pitch ($forward\_head$)
Computed using the ratio of facial width $F$ (ear-to-ear) to shoulder span $W$, relative to the calibrated baseline $(F_0 / W_0)$:
$$\text{forward\_head} = \frac{F / W}{F_0 / W_0} - 1$$
*Starts counting strain at $0.06$; reaches maximum strain at $0.18$.*

### 2. Head Drop / Thoracic Slouch ($head\_drop$)
Vertical distance $D$ from the tragus ear midpoint down to the clavicle/shoulder midpoint:
$$\text{head\_drop} = 1 - \frac{D / W}{D_0 / W_0}$$
*Catches shoulders hunching up toward ears ($0.08$ to $0.22$).*

### 3. Eye Aspect Ratio & Blendshape Blink Tracking
Uses MediaPipe FaceLandmarker blendshapes `eyeBlinkLeft` and `eyeBlinkRight`:
$$\text{BlinkScore} = \frac{\text{eyeBlinkLeft} + \text{eyeBlinkRight}}{2}$$
A blink is registered when the score spikes above the user's calibrated threshold for 50–400 ms. Trailing 60-second counts below 8 blinks/min trigger optical fatigue warnings.

### 4. Strain Index Fusion & Maximum Rule
To prevent a severe posture defect from being washed out by an arithmetic average, ErgoGotchi takes the maximum strain score across all active signals:
$$\text{strain} = \max(\text{forward\_head}_s,\ \text{head\_drop}_s,\ \text{head\_pitch}_s,\ \text{lean\_in}_s,\ \text{tilt}_s,\ 0.6 \times \text{blink}_s)$$

---

## 🚀 Quickstart & Setup Guide

### Prerequisites
- Node.js (v18+) & npm
- Python (3.10+)
- Docker & Docker Compose *(optional for local TimescaleDB; automatic SQLite fallback is included)*

### 1. Clone & Set Up Environment
```bash
git clone https://github.com/nt6749/sunhacks-project2.git
cd sunhacks-project2
cp .env.example .env
```

### 2. Start Backend Service
```bash
# Set up Python virtual environment
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt

# Run FastAPI Server (serves WebSockets & Tiger Data endpoints on port 8000)
python backend/app/main.py
```
*(Note: If PostgreSQL/TimescaleDB is not running locally, ErgoGotchi automatically starts in SQLite emulation mode, ensuring 100% zero-config operation!)*

### 3. Start Frontend & Desktop App
```bash
# Install frontend dependencies
npm install

# Option A: Run Vite Web App (Runs in your browser with desktop simulator)
npm run dev

# Option B: Run Native Electron Transparent Desktop Pet
npm run electron
```

---

## ⚡ 3-Minute Live Judging Demo Script

| Time | Segment | What to Show / Pitch |
| :--- | :--- | :--- |
| **0:00 - 0:45** | **The Hook & Problem** | Show the ErgoGotchi pet cheerfully bouncing at the bottom of the screen wearing tiny headphones. *"Developers spend 10+ hours a day coding, but ergonomic strain causes permanent damage. Traditional posture apps feel like creepy HR spyware. Meet ErgoGotchi: a desktop companion whose life depends on your posture."* |
| **0:45 - 1:30** | **The Slouch Trigger** | Intentionally hunch forward and drop your shoulders at the webcam (or tap key `2` in Demo Mode). Within 1.5–3 seconds, show the pet stop walking, squish into a melted yellow puddle with a sweat drop, and pop up a witty Gemini comic speech bubble: *"You're folding like a lawn chair. Retract that chin!"* Show the Biomechanical Stretch badge `[CHIN_TUCK]`. |
| **1:30 - 2:15** | **Tiger Data Architecture** | Double-click the pet to pop out the **Companion Dashboard**. Point out the continuous aggregate chart: *"Here is our continuous 1 Hz telemetry flowing into PostgreSQL. Notice the 1-minute bucketed continuous aggregate `ergo_1min` calculating strain velocity in real time using windowed `LAG()` functions."* |
| **2:15 - 2:45** | **Privacy & Invariant Calibration** | Explain the technical depth: *"ErgoGotchi processes every frame client-side via WebAssembly with zero video egress. Because it uses 5-second relative calibration, it tracks your personal baseline drift—making it immune to different camera angles and laptop heights."* |
| **2:45 - 3:00** | **The Revive & Finish** | Sit tall and upright. ErgoGotchi immediately does a full **360° backflip**, sparkles burst across the screen, and the pet revives into Thriving mode with an uplifting retro chime. *"ErgoGotchi makes ergonomic wellness biologically responsive, privacy-first, and delightful."* |

---

## ⌨️ Live Demo Hotkeys

For seamless presentation during table judging:
- <kbd>1</kbd> : Force **Thriving** State (HP 95%, happy bounce)
- <kbd>2</kbd> : Force **Slouching** State (HP 45%, melted puddle, comic roast)
- <kbd>3</kbd> : Force **Wilted** State (HP 15%, sleeping ghost)
- <kbd>4</kbd> : Release manual override (resumes live camera tracking)
- <kbd>D</kbd> : Toggle **Demo Mode** (accelerated 1.5s dwell & 3s speech bubble timers)
- <kbd>C</kbd> : Trigger 5-second **Posture Calibration**

---

## 🐅 Tiger Data Continuous Aggregates SQL

```sql
-- 1-minute continuous aggregate with real-time materialization enabled
CREATE MATERIALIZED VIEW ergo_1min
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT
  time_bucket('1 minute', recorded_at) AS bucket,
  session_id,
  avg(strain_index)   AS avg_strain,
  max(strain_index)   AS peak_strain,
  avg(forward_head)   AS avg_forward_head,
  avg(head_drop)      AS avg_head_drop,
  avg(blink_rate_1m)  AS avg_blink_rate,
  min(hp)             AS min_hp
FROM ergo_telemetry
WHERE present
GROUP BY bucket, session_id;

-- Automated refresh policy
SELECT add_continuous_aggregate_policy('ergo_1min',
  start_offset      => INTERVAL '1 hour',
  end_offset        => INTERVAL '1 minute',
  schedule_interval => INTERVAL '1 minute');

-- Real-time fatigue velocity query for companion dashboard
SELECT bucket,
       avg_strain,
       avg_strain - LAG(avg_strain) OVER (ORDER BY bucket) AS strain_velocity
FROM ergo_1min
WHERE session_id = $1 AND bucket > now() - INTERVAL '30 minutes'
ORDER BY bucket;
```

---

## 🧪 Automated Testing
Run the complete unit test suite verifying scoring dwell time, HP decay, demo transitions, and signal guards:
```bash
# Run scoring test suite
npm run test

# Run backend pytest suite
pytest backend/tests/test_engine.py
```

---

## 👥 sunhacks 2026 Team
Built with ❤️ for **sunhacks 2026** by Team ErgoGotchi.
