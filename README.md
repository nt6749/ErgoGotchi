# 👾 ErgoGotchi (ErgoBuddy)
### Biometric Desktop Companion & Ergonomic Telemetry Engine
> **sunhacks 2026** · Target Tracks: **Best Mascot**, **Future of Work (JFFVentures)**, **Best Use of Gemini API**, **Best Use of Tiger Data**, **Best Gaming**, **SpaceXSI A-Team**.

[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](LICENSE)
[![Google Gemini](https://img.shields.io/badge/Google%20Gemini-3.8%20Flash-blue)](https://ai.google.dev/)
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

When you maintain flow with upright spinal alignment, ErgoGotchi energetically bounces and sports tiny headphones. Slumping or forward head drift causes the pet to visibly melt into a gelatinous, stressed puddle tapping on your glass. When ergonomic thresholds breach, **Google Gemini 3.8 Flash** steps in as your pet’s witty voice, serving context-aware comic roasts and clinically sound micro-stretches.

```
                  ┌────────────────────────────────────────┐
                  │          ErgoGotchi Architecture       │
                  └────────────────────────────────────────┘

     ┌─────────────────────── CLIENT EDGE (DESKTOP) ───────────────────────┐
     │                                                                     │
     │  Webcam (640x480) ──> MediaPipe Pose (33) & FaceLandmarker (478)    │
     │  [Exclusive Hardware Owner]                                         │
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
     │    Mascot Sprite Window          BroadcastChannel Telemetry Sync    │
     │   (Transparent Electron)         (Dual-Window Zero-Lag Stream)      │
     │   • Thriving (Backflip!)                   │                        │
     │   • Slouching Puddle                       ▼                        │
     │   • Wilted Ghost                 Companion Dashboard Window         │
     │   • Comic Speech Bubble          • Live Clean Video Preview         │
     │   • OS Context Activities        • Real-Time HP & Fatigue Graphs    │
     │   • Duck Dash Canvas Game        • Wardrobe & Handheld Casing Skins │
     └────────────────────────────────────────────┬────────────────────────┘
                                                  │
                                                  │ WebSockets (WSS) / HTTP
                                                  ▼
     ┌────────────────────── CLOUD / BACKEND (Docker) ──────────────────────┐
     │                                                                     │
     │                   FastAPI WebSocket & Relay Server                  │
     │                   (Auto SQLite Fallback if DB Offline)              │
     │                                    │                                │
     │            ┌───────────────────────┴────────────────────────┐       │
     │            ▼                                                ▼       │
     │   Tiger Data (TimescaleDB)              Google Gemini 3.8 Flash     │
     │   • Hypertables (1-hr chunks)           • Pre-Warmed Cache & Leases │
     │   • Continuous Aggs (ergo_1min)         • Structured JSON Prompts   │
     │   • Strain Velocity: LAG()              • 1-Token Connection Probes │
     │   • 90%+ Automatic Compression          • Biomechanical Stretch Cues│
     └─────────────────────────────────────────────────────────────────────┘
```

---

## ✨ Latest Release Highlights & Native Capabilities (v1.0.3)

- 🥚 **Classic Eggshell Virtual Pet Casing & Wardrobe Skins**: Experience ErgoGotchi in an authentic vintage handheld virtual pet device! Features a physical eggshell enclosure with metallic chain link, speaker grill perforations, starburst bezel, and 6 collectible casing skins: *Classic Sunshine Yellow, Cosmic Midnight Moon & Stars, Pastel Rainbow Candy, Fresh Avocado Gingham, Kuromi Dark Lavender, and Retro Teal*.
- 🎮 **3 Classic Physical Hardware Buttons**:
  - **Button A (Pet 💖)**: Pet your duck at any time! Triggers a happy chime, joyful jelly bounce, and a burst of floating hearts and sparkles.
  - **Button B (Feed 🌽)**: Feed your duck with earned corn to boost happiness and level up.
  - **Button C (Lock / Move 🔒)**: One-click position lock. Lock your pet in place so clicks won't move it, or click to unlock and freely drag the egg machine anywhere across your monitors.
- 🕹️ **"Duck Dash" 8-Bit Canvas Mini-Game**: Built directly into the Dashboard's Quests tab! Play a retro HTML5 Canvas endless runner where your duck (in its current life stage and equipped wardrobe items) leaps over traffic cones, hay bales, and wooden crates, collecting golden corn to stock your pantry and power up your pet.
- 🦫 **OS Context-Aware Activity Detection**: Driven by `electron/activityClassifier.cjs`, ErgoGotchi passively monitors your active foreground OS window:
  - **Coding / Work (`WORKING`)**: When coding in VS Code, IntelliJ, Terminal, or browsing GitHub/docs, your duck pulls out a tiny laptop and types furiously with you.
  - **Music Grooving (`MUSIC`)**: When Spotify or music apps play, the duck pops on headphones and bobs to the beat.
  - **Video Streaming (`WATCHING`)**: When watching YouTube, Netflix, or media players, the duck kicks back and eats popcorn.
- 🐣 **3-Stage Evolution & Cosmetic Wardrobe**: Your companion evolves through 3 distinct life stages—`EGG` ➔ `BABY` (hatches at Level 3) ➔ `ADULT` (Level 7)—with 3 customizable cosmetic slots (*Hats, Eyewear, Neckwear*) unlocked through posture discipline.
- 🌸 **Aesthetic Theme Engine (Sanrio Pastel & Kuromi Gothic Pop)**: Brand new theme system with real-time swatch cards in Settings and a top-bar cycle pill:
  - **Sanrio Pastel 🌸**: Strawberry milk blush, marshmallow cloud surfaces, pastel pinks, and warm plum ink.
  - **Kuromi Gothic Pop 🎀**: Midnight purple velvet, electric neon pink & mint accents, and dark aesthetic styling.
  - **Midnight Dark 🌙** & **Daylight Cream ☀️**: Clean ergonomic high-contrast dark and light modes.
- 🧙 **5-Step Onboarding Wizard with AI & Webhook Configuration**: Includes 1-token Google Gemini 3.8 Flash key verification, Discord/Slack/ntfy.sh test pings, SSRF protection, and guaranteed `.env` preservation with offline fallback.
- ⚡ **Single Hardware Owner Webcam Architecture**: Primary desktop pet exclusively controls MediaPipe WASM and the webcam hardware to prevent Windows `NotReadableError`, broadcasting clean 640x360 video and high-DPI telemetry via `BroadcastChannel` with zero lag.
- 💫 **Poppy Jelly Physics & Centered Overlays**: Fluid squash-and-stretch jelly bounce (`animate-jelly`), gentle floating levitation, and isolated layout coordinates ensuring corn counts, XP popups, and draggable hints stay centered over your pet companion.
- 🌽 **Streamlined Corn Level Display**: The corn level indicator now defaults to clean and minimal (revealing automatically on hover), with an option in Settings to keep it pinned at all times.
- 🔄 **Companion Dashboard Auto-Updater**: ErgoGotchi checks GitHub Releases for new versions and cleanly displays updates right inside the Companion Dashboard with a one-click **"Update & Restart 🚀"** workflow.
- 🚀 **System Startup Launch Support**: Auto-launch ErgoGotchi on boot via `openAtLogin` with clear desktop environment notices.

---

## 🎯 Target Sponsor Tracks & Prize Alignment

| Sponsor Track | Prize / Category | Concrete ErgoGotchi Implementation |
| :--- | :--- | :--- |
| 🦫 **Best Mascot** | Buc-ee's + XPPen Tablets | A fully custom, animated cyber-mascot with 3 life stages (`EGG` ➔ `BABY` ➔ `ADULT`), customizable 3-slot wardrobe cosmetics, OS context-aware reactivity (coding on laptop, Spotify headphones, movie popcorn), and a 360° backflip on posture recovery. |
| 💼 **Future of Work** | JFFVentures (Stream Decks + VC Pitch) | Privacy-preserving edge biometrics: zero video egress (frames processed in RAM and discarded); uses relative deviation from the user's calibrated baseline to prevent fatigue without HR surveillance. |
| ♊ **Best Use of Gemini API** | MLH Swag Kits & Honors | Google Gemini 3.8 Flash (`gemini-3.8-flash`) powers the pet’s personality engine with structured JSON responses, serving snappy, context-aware roasts, clinically grounded micro-stretch cues, and non-blocking 1-token connection probes. |
| 🐅 **Best Use of Tiger Data** | Stream Deck Mini | Ingests continuous 1 Hz telemetry into PostgreSQL hypertables; leverages `timescaledb.continuous` 1-minute materialized views (`ergo_1min`) and `LAG()` window functions to compute real-time strain velocity. |
| 🎮 **Best Gaming** | Gaming Track | Virtual pet survival gameplay: 0–100 HP decay curve, level-ups, posture discipline XP, death/revival state mechanics, and the playable **"Duck Dash"** 8-bit HTML5 Canvas endless runner mini-game. |
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

## ⚙️ System Requirements & Execution Modes

ErgoGotchi is engineered with **Edge-First Resilience**: it runs standalone out-of-the-box with zero Docker requirement, and smoothly scales up to full cloud superpowers when connected.

| Mode | Target User / Goal | Requirements | Docker Needed? | Capabilities |
| :--- | :--- | :--- | :--- | :--- |
| 🟢 **Mode 1: Standalone Desktop Companion** *(Recommended for Judges)* | End-users & quick judge review (Default `.exe` / `.dmg`) | Windows 10/11 or macOS, standard webcam | ❌ **NO** | 100% on-device MediaPipe vision, real-time HP & scoring, retro sound synth, Duck Dash mini-game, eggshell skins, foreground app tracking, canned clinical stretch roasts. Zero server dependencies. |
| 🟡 **Mode 2: Full-Stack with Local Database** | Developers & local presentation mode | Node.js 18+, Python 3.10+, `.env` (Gemini API key) | ❌ **NO** *(Auto SQLite)* | Everything in Mode 1 + local FastAPI server, automatic zero-config SQLite database (`ergogotchi_local.db`), Google Gemini 3.8 Flash adaptive voice lines, and Discord/Slack/ntfy.sh webhooks. |
| 🔵 **Mode 3: Tiger Data & Cloud Production** | Tiger Data sponsor track review & multi-tenant scaling | Docker Compose or cloud instance | Optional *(Docker)* | Everything in Mode 2 + Tiger Data (TimescaleDB) PostgreSQL hypertables, 1-minute continuous aggregates (`ergo_1min`), and automated 90%+ compression. |

> 💡 **Do I need Docker to run the `.exe` installer?**  
> **No.** The compiled `.exe` and `.dmg` installers do not install, run, or require Docker. Docker is strictly an optional developer convenience for the Tiger Data TimescaleDB hypertable stack.

### 🔑 Requirements for 100% Full Functionality

To experience all cloud and sponsor track features simultaneously:
- **Webcam**: Any built-in or USB webcam (30 FPS @ 640×480).
- **Google Gemini API Key**: Free key from [Google AI Studio](https://aistudio.google.com/) (powers Gemini 3.8 Flash dynamic voice roasts and session debriefs).
- **Webhook URL (Optional)**: Free `https://ntfy.sh/your_channel` or Discord/Slack webhook for mobile lock-screen alerts.
- **TimescaleDB / Tiger Data (Optional)**:
  - *Without Docker*: Falls back automatically to local zero-config SQLite (`ergogotchi_local.db`).
  - *With Docker*: `docker compose up -d` for continuous 1-minute hypertable aggregation.

---

## 💾 Installation & Setup Guide

Choose the method that works best for you:

### 🌟 Method 1: Guided Installation Wizard (Recommended)
*The fastest, easiest way to install ErgoGotchi—perfect for beginners and judges!*

| Platform | Installer File | Installation Steps |
| :--- | :--- | :--- |
| **🪟 Windows (10/11)** | [📥 **Download Windows Setup Wizard (`.exe`)**](https://github.com/nt6749/ErgoGotchi/releases) | 1. Download installer wizard.<br>2. Run the `.exe` installer wizard.<br>3. Choose where to install your files (custom directory or standard `AppData`/`Program Files`).<br>4. Check "Create Desktop Shortcut".<br>5. Click **Install** & launch! |
| **🍏 macOS (Apple Silicon / Intel)** | [📥 **Download macOS Disk Image (`.dmg`)**](https://github.com/nt6749/ErgoGotchi/releases) | 1. Open the `.dmg` file.<br>2. Drag the **ErgoGotchi** duck icon into your **Applications** folder.<br>3. Launch from Launchpad or Applications! |

#### 🪄 The 5-Step First-Run Onboarding Wizard
When you open ErgoGotchi for the first time, a streamlined setup wizard guides your setup:
1. **Welcome Your New Pet**: Meet your companion and learn how posture HP works.
2. **Camera & 8-Bit Audio Check**: Camera selection, live stream preview, and procedural 8-bit retro audio chime test (*100% on-device AI—zero video frames ever leave your laptop*).
3. **5-Second Upright Posture Calibration**: Sit tall, look at your monitor naturally, and lock in your personal baseline zero-point.
4. **AI Persona & Notifications Setup (Optional)**: Connect your Google Gemini 3.8 Flash API key with instant 1-token test verification, configure Discord/Slack/ntfy.sh mobile alerts, or click "Skip for Now" with zero penalty.
5. **Quick-Start Guide & Launch**: Learn petting, click-through, dragging, and position locking, then transition directly into your desktop companion!

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

For seamless presentation and table judging without needing to wait for physical fatigue:

| Key | Action | Live Presentation Purpose |
| :--- | :--- | :--- |
| <kbd>1</kbd> | Force **Thriving** State | HP 95%, energetic bounce, backflip recovery trigger |
| <kbd>2</kbd> | Force **Slouching** State | HP 45%, melted puddle, sweat drops, comic Gemini roast |
| <kbd>3</kbd> | Force **Wilted** State | HP 15%, sleeping ghost state, low health warnings |
| <kbd>4</kbd> | **Camera Following** | Releases manual state override; follows live webcam biometrics |
| <kbd>5</kbd> | **Meme Knife Warning** | Triggers easter-egg *"don't duck with me"* warning modal |
| <kbd>6</kbd> | Force **Watching** Scene | Duck sits back and munches popcorn (media playback state) |
| <kbd>7</kbd> | Force **Music** Scene | Duck sports headphones and grooves to the beat |
| <kbd>8</kbd> | Force **Working** Scene | Duck pulls out a tiny laptop and types furiously |
| <kbd>9</kbd> | **Auto OS Activity Tracking** | Automatically classifies foreground window (VS Code, Spotify, YouTube) |
| <kbd>D</kbd> | Toggle **Demo Mode** | Accelerates dwell (1.5s) & speech timers (3s) for fast presentations |
| <kbd>C</kbd> | Trigger **Calibration** | Runs instant 5-second upright zero-point posture calibration |
| <kbd>F</kbd> | **Feed Duck** | Feeds pet with corn from pantry (+HP & evolution progress) |
| <kbd>X</kbd> | **+10 Corn** | Instant pantry deposit of 10 golden corn kernels |
| <kbd>Z</kbd> | **+100 Corn** | Instant pantry deposit of 100 golden corn kernels for shopping |
| <kbd>]</kbd> | **Level Up** | Fast-forwards pet evolution (`EGG` ➔ `BABY` ➔ `ADULT`) |
| <kbd>[</kbd> | **Level Down** | Steps backward in evolutionary growth |
| <kbd>E</kbd> | **Reset to Egg** | Resets growth back to newborn Egg stage |

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
