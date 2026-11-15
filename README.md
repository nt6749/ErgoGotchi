# 👾 ErgoGotchi (ErgoBuddy)
### Biometric Desktop Companion & Ergonomic Telemetry Engine
> **sunhacks 2026** · Target Tracks: **Best Mascot**, **Future of Work (JFFVentures)**, **Best Use of Gemini API**, **Best Use of Tiger Data**, **Best Gaming**, **SpaceXSI A-Team**.

[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](LICENSE)
[![Google Gemini](https://img.shields.io/badge/Google%20Gemini-Powered-blue)](https://ai.google.dev/)
[![Tiger Data](https://img.shields.io/badge/Tiger%20Data-TimescaleDB%20Hypertables-orange)](https://www.tigerdata.com/)
[![MediaPipe](https://img.shields.io/badge/MediaPipe-Edge%20Biometrics-cyan)](https://developers.google.com/mediapipe)
[![Release](https://img.shields.io/github/v/release/nt6749/ErgoGotchi?color=emerald&label=Latest%20Release)](https://github.com/nt6749/ErgoGotchi/releases)
[![Windows](https://img.shields.io/badge/Windows-Setup%20.exe-blue?logo=windows)](https://github.com/nt6749/ErgoGotchi/releases/latest)
[![macOS](https://img.shields.io/badge/macOS-Disk%20Image%20.dmg-black?logo=apple)](https://github.com/nt6749/ErgoGotchi/releases/latest)

---

### ⚡ Quick Downloads & Play (Hackathon Judges & Users)

> 🚀 **[📥 Download Latest Official Release from GitHub Releases](https://github.com/nt6749/ErgoGotchi/releases)** — Ready-to-run compiled binaries for Windows and macOS.

| Platform | Recommended Installer | Alternative / Portable | Status |
| :--- | :--- | :--- | :--- |
| **🪟 Windows (10/11)** | [📥 **Download Setup Wizard (`.exe`)**](https://github.com/nt6749/ErgoGotchi/releases) | [📦 Portable Binary (`.exe`)](https://github.com/nt6749/ErgoGotchi/releases) | `v1.0.3 Ready` |
| **🍏 macOS (Apple Silicon / Intel)** | [📥 **Download Disk Image (`.dmg`)**](https://github.com/nt6749/ErgoGotchi/releases) | [📦 All Release Assets](https://github.com/nt6749/ErgoGotchi/releases) | `v1.0.3 Ready` |

> 🏷️ **[View Full Release Notes & Assets on GitHub Releases](https://github.com/nt6749/ErgoGotchi/releases)** · 100% on-device AI biometrics (zero video frames leave your machine). Compiled releases include Windows Setup (`ErgoGotchi-Setup-1.0.3.exe`), Portable (`ErgoGotchi-Portable-1.0.3.exe`), and macOS Disk Image (`ErgoGotchi-1.0.3.dmg`).

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
     ┌────────────────────── CLOUD / BACKEND (Docker) ──────────────────────┐
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

## ✨ Latest Release Highlights & Native Capabilities (v1.0.3)

- 🥚 **Classic Eggshell Virtual Pet Casing & Wardrobe Skins**: Experience ErgoGotchi in an authentic vintage handheld virtual pet device! Features a physical eggshell enclosure with metallic chain link, speaker grill perforations, starburst bezel, and 6 collectible casing skins: *Classic Sunshine Yellow, Cosmic Midnight Moon & Stars, Pastel Rainbow Candy, Fresh Avocado Gingham, Kuromi Dark Lavender, and Retro Teal*.
- 🎮 **3 Classic Physical Hardware Buttons**:
  - **Button A (Pet 💖)**: Pet your duck at any time! Triggers a happy chime, joyful jelly bounce, and a burst of floating hearts and sparkles.
  - **Button B (Feed 🌽)**: Feed your duck with earned corn to boost happiness and level up.
  - **Button C (Lock / Move 🔒)**: One-click position lock. Lock your pet in place so clicks won't move it, or click to unlock and freely drag the egg machine anywhere across your monitors.
- 🌸 **Aesthetic Theme Engine (Sanrio Pastel & Kuromi Gothic Pop)**: Brand new theme system with real-time swatch cards in Settings and a top-bar cycle pill:
  - **Sanrio Pastel 🌸**: Strawberry milk blush, marshmallow cloud surfaces, pastel pinks, and warm plum ink.
  - **Kuromi Gothic Pop 🎀**: Midnight purple velvet, electric neon pink & mint accents, and dark aesthetic styling.
  - **Midnight Dark 🌙** & **Daylight Cream ☀️**: Clean ergonomic high-contrast dark and light modes.
- 💫 **Poppy Jelly Physics & Centered Overlays**: Fluid squash-and-stretch jelly bounce (`animate-jelly`), gentle floating levitation, and isolated layout coordinates ensuring corn counts, XP popups, and draggable hints stay centered over your pet companion.
- 🌽 **Streamlined Corn Level Display**: The corn level indicator now defaults to clean and minimal (revealing automatically on hover), with an option in Settings to keep it pinned at all times.
- 🔄 **Companion Dashboard Auto-Updater**: ErgoGotchi checks GitHub Releases for new versions and cleanly displays updates right inside the Companion Dashboard with a one-click **"Update & Restart 🚀"** workflow.
- 🚀 **System Startup Launch Support**: Auto-launch ErgoGotchi on boot via `openAtLogin` with clear desktop environment notices.

---

## 🎯 Target Sponsor Tracks & Prize Alignment

| Sponsor Track | Prize / Category | Concrete ErgoGotchi Implementation |
| :--- | :--- | :--- |
| 🦫 **Best Mascot** | Buc-ee's + XPPen Tablets | A fully custom, animated cyber-blob with distinct physical states: bouncing walk, melted slouch puddle, ghost halo, interactive petting hearts, and a one-shot 360° backflip on posture recovery. |
| 💼 **Future of Work** | JFFVentures (Stream Decks + VC Pitch) | Privacy-preserving edge biometrics: zero video egress (frames processed in RAM and discarded); uses relative deviation from the user's calibrated baseline to prevent fatigue without HR surveillance. |
| ♊ **Best Use of Gemini API** | MLH Swag Kits & Honors | Gemini powers the pet’s personality engine with structured JSON responses, serving snappy, context-aware roasts and clinically grounded micro-stretch biomechanical cues. |
| 🐅 **Best Use of Tiger Data** | Stream Deck Mini | Ingests continuous 1 Hz telemetry into PostgreSQL hypertables; leverages `timescaledb.continuous` 1-minute materialized views (`ergo_1min`) and `LAG()` window functions to compute real-time strain velocity. |
| 🎮 **Best Gaming** | Gaming Track | Virtual pet survival gameplay: 0–100 HP decay curve, level-ups, posture discipline XP, and death/revival state mechanics. |
| 🚀 **SpaceXSI A-Team** | Mechanical Keyboards | Automated Grok Bot webhook service generating personal, opt-in daily focus and posture summaries in Discord/Slack. |

---

## 🧮 Mathematical Formulation & Sensing Pipeline

To ensure scientific accuracy over naive pixel thresholds:

### 1. Relative Forward Head Pitch (`forward_head`)
Computed using the ratio of facial width $F$ (ear-to-ear) to shoulder span $W$, relative to the calibrated baseline $(F_0 / W_0)$:
$$\text{Forward Head} = \frac{F / W}{F_0 / W_0} - 1$$
*Starts counting strain at 0.06; reaches maximum strain at 0.18.*

### 2. Head Drop / Thoracic Slouch (`head_drop`)
Vertical distance $D$ from the tragus ear midpoint down to the clavicle/shoulder midpoint:
$$\text{Head Drop} = 1 - \frac{D / W}{D_0 / W_0}$$
*Catches shoulders hunching up toward ears (0.08 to 0.22).*

### 3. Eye Aspect Ratio & Blendshape Blink Tracking
Uses MediaPipe FaceLandmarker blendshapes `eyeBlinkLeft` and `eyeBlinkRight`:
$$\text{Blink Score} = \frac{\text{eyeBlinkLeft} + \text{eyeBlinkRight}}{2}$$
A blink is registered when the score spikes above the user's calibrated threshold for 50–400 ms. Trailing 60-second counts below 8 blinks/min trigger optical fatigue warnings.

### 4. Strain Index Fusion & Maximum Rule
To prevent a severe posture defect from being washed out by an arithmetic average, ErgoGotchi takes the maximum strain score across all active signals:
$$\text{Strain} = \max(S_{\text{forward}},\ S_{\text{drop}},\ S_{\text{pitch}},\ S_{\text{lean}},\ S_{\text{tilt}},\ 0.6 \times S_{\text{blink}})$$
*where $S$ represents the normalized $0.0\text{--}1.0$ strain contribution of each biometric signal (`forward_head`, `head_drop`, `head_pitch`, `lean_in`, `tilt`, `blink`).*

---

## 💾 Installation & Setup Guide

Choose the method that works best for you:

### 🌟 Method 1: Guided Installation Wizard (Recommended)
*The fastest, easiest way to install ErgoGotchi—perfect for beginners and judges!*

| Platform | Installer File | Installation Steps |
| :--- | :--- | :--- |
| **🪟 Windows (10/11)** | [📥 **Download Windows Setup Wizard (`.exe`)**](https://github.com/nt6749/ErgoGotchi/releases) | 1. Download installer wizard.<br>2. Run the `.exe` installer wizard.<br>3. Choose where to install your files (custom directory or standard `AppData`/`Program Files`).<br>4. Check "Create Desktop Shortcut".<br>5. Click **Install** & launch! |
| **🍏 macOS (Apple Silicon / Intel)** | [📥 **Download macOS Disk Image (`.dmg`)**](https://github.com/nt6749/ErgoGotchi/releases) | 1. Open the `.dmg` file.<br>2. Drag the **ErgoGotchi** duck icon into your **Applications** folder.<br>3. Launch from Launchpad or Applications! |

#### 🪄 The First-Run Onboarding Wizard
When you open ErgoGotchi for the first time, a cute setup wizard appears:
1. **Welcome Your New Pet**: Meet your pixel duck and learn how posture HP works.
2. **Camera & Privacy Check**: One-click camera test with live preview and camera device dropdown (*100% on-device AI—zero video frames ever leave your laptop*).
3. **8-Bit Sound Test**: Hear the procedural retro audio chime.
4. **5-Second Upright Posture Calibration**: Sit tall, look at your monitor naturally, and lock in your baseline zero-point.
5. **Ready to Play**: Transition directly into the desktop companion!

---

### 💻 Method 2: Developer Setup from Source (CLI)
*For developers modifying source code or contributing:*

#### Prerequisites
- **Python (3.10+)**: Make sure `python --version` works in your terminal.
- **Node.js (v18 or v20+ LTS) & npm**:
  - *macOS*: `brew install node`
  - *Windows*: Download and run the official installer from [nodejs.org](https://nodejs.org/) or run `winget install OpenJS.NodeJS.LTS`.

#### 1. Clone & Set Up Environment
```bash
git clone https://github.com/nt6749/ErgoGotchi.git
cd ErgoGotchi
cp .env.example .env
```

#### 2. Start Backend Service
**On macOS / Linux:**
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
./scripts/start_backend.sh
```

**On Windows (PowerShell / Command Prompt):**
```cmd
python -m venv .venv
.venv\Scripts\activate
pip install -r backend\requirements.txt
scripts\start_backend.bat
```
*(Note: If TimescaleDB is not running locally, ErgoGotchi automatically starts in SQLite emulation mode with zero configuration needed!)*

#### 3. Start Frontend & Desktop App
```bash
# Install frontend dependencies
npm install

# Option A: Run in Browser with Desktop Simulator
npm run dev

# Option B: Run Native Electron Transparent Desktop Pet
npm run electron

# Option C: One-Click Unified Launcher (starts both backend & electron)
node scripts/launcher.cjs
```

#### 4. Packaging Installers Locally
```bash
# Build Windows NSIS Setup Wizard & Portable (.exe)
npm run package:win

# Build macOS DMG & App Bundle (.dmg, .app)
npm run package:mac
```
*(Note: You can also use our automated GitHub Actions workflow [`.github/workflows/release.yml`](.github/workflows/release.yml) to compile installers in the cloud on every release!)*

---

### 🐳 Method 3: Docker Compose Stack (Tiger Data & Cloud Brain)
*For running the production multi-tenant backend with TimescaleDB hypertables on Vultr or locally:*
```bash
docker compose up -d
```
Ingests 1 Hz telemetry into `ergo_telemetry` and populates the continuous aggregate view `ergo_1min`.

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

## 👥 sunhacks 2026 Team & Workload Split
For complete developer domain guides, see **[TEAM_WORKLOAD_SPLIT.md](TEAM_WORKLOAD_SPLIT.md)**:
- 👁️ **Developer 1 (Sensing & Scoring)**: [`src/dev1_sensing_and_scoring/`](src/dev1_sensing_and_scoring/) — [Dev 1 Guide](src/dev1_sensing_and_scoring/README.md)
- 🦫 **Developer 2 (Mascot & Desktop UI)**: [`src/dev2_mascot_and_ui/`](src/dev2_mascot_and_ui/) & [`electron/`](electron/) — [Dev 2 Guide](src/dev2_mascot_and_ui/README.md)
- 🐅 **Developer 3 (Tiger Data & Gemini Cloud)**: [`backend/`](backend/) — [Dev 3 Guide](backend/DEV3_BACKEND_GUIDE.md)

Built with ❤️ for **sunhacks 2026** by Team ErgoGotchi.
