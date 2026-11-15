# 👥 ErgoGotchi Team Workload Split & Hackathon Coordination
> **sunhacks 2026** · 3-Developer Independent Architecture & Execution Roadmap  
> **Rule #1**: Each developer owns an isolated directory. No two developers edit the same file tonight!

---

## 🗺️ Clean Folder & Ownership Map

```
ErgoGotchi/
│
├── 📂 src/dev1_sensing_and_scoring/    ──► DEVELOPER 1 (Sensing, Biometrics & Scoring)
│   ├── visionPipeline.ts                 • MediaPipe Face (478 pts) & Pose (33 pts)
│   ├── scoring.ts                        • 5s upright calibration zero-point
│   ├── scoring.test.ts                   • Relative posture signals & guards
│   └── README.md                         • Pure on-device scoring step() engine
│
├── 📂 src/dev2_mascot_and_ui/          ──► DEVELOPER 2 (Mascot Experience & UI)
│   ├── MascotSprite.tsx                  • Bobi the Posture Blob (6 animated SVG loops)
│   ├── soundEffects.ts                   • One-shot 360° backflip revival animation
│   ├── Dashboard.tsx                     • Web Audio API retro 8-bit sound synthesizer
│   └── README.md                         • Pop-out companion dashboard & fatigue charts
│
├── 📂 electron/                        ──► DEVELOPER 2 (Desktop Shell & Packaging)
│   ├── main.cjs                          • Frameless transparent always-on-top window
│   ├── preload.cjs                       • Dynamic window expansion for speech bubbles
│   └── (build artifacts in release/)     • Native .app (Mac) and .exe (Windows) packaging
│
├── 📂 backend/                         ──► DEVELOPER 3 (Cloud Brain, Tiger Data & Gemini)
│   ├── app/main.py                       • FastAPI WebSocket relay (1 Hz batching)
│   ├── app/gemini/engine.py              • Google Gemini 2.5 Flash Persona Engine
│   ├── app/db/schema.sql & database.py   • Tiger Data (TimescaleDB) hypertables & continuous aggs
│   ├── app/grok_bot/service.py           • SpaceXSI Grok Bot Discord/Slack webhook
│   ├── scripts/seed_history.py           • 7,200 points realistic history seeder
│   ├── scripts/load_simulator.py         • 300-session synthetic load generator (~1M rows/hr)
│   ├── DEV3_BACKEND_GUIDE.md             • Developer 3 technical instructions
│   └── docker-compose.yml                • Multi-container cloud deployment
│
├── 📂 src/types/                       ──► SHARED & FROZEN (Contracts 1, 2, 3)
│   └── index.ts                          • Fixed data contracts, enums & signal schemas
│
└── 📂 src/net/                         ──► SHARED (Resilient WebSocket Client)
    └── websocketClient.ts                • Zero-error client with 2s canned line fallback
```

---

## 🧑‍💻 The 3 Developer Assignments

### 👁️ Developer 1: Sensing, Biometrics & Scoring Engine
- **Directory**: [`src/dev1_sensing_and_scoring/`](src/dev1_sensing_and_scoring/)
- **Guide**: [dev1_sensing_and_scoring/README.md](src/dev1_sensing_and_scoring/README.md)
- **Target Tracks**: Future of Work (JFFVentures), Gaming
- **Tonight's Tasks**:
  1. **Threshold Tuning**: Test the calibration and sensitivity with all 3 teammates (with glasses, without glasses, different lighting).
  2. **Camera Angles**: Test laptop on lap vs table. Verify that baseline-relative ratios ($\frac{F/W}{F_0/W_0}$) stay robust.
  3. **Signal Guards**: Confirm that turning your head sideways ($|\text{Yaw}| > 15^\circ$) holds the last value and doesn't trigger false forward-head slouch alarms.
  4. **Run Unit Tests**: Keep Vitest running with `npm test`.

---

### 🦫 Developer 2: Mascot Experience, Desktop Shell & Dashboard
- **Directory**: [`src/dev2_mascot_and_ui/`](src/dev2_mascot_and_ui/) & [`electron/`](electron/)
- **Guide**: [dev2_mascot_and_ui/README.md](src/dev2_mascot_and_ui/README.md)
- **Target Tracks**: Best Mascot (Buc-ee's + XPPen Tablets), Future of Work
- **Tonight's Tasks**:
  1. **Animation Polish**: Fine-tune the timing of the **360° backflip** (`animate-backflip`), wobble puddle, and floating hearts.
  2. **Sound Synthesis**: Balance the Web Audio API synthesizer volume in `soundEffects.ts` so the chimes sound pleasant on laptop speakers.
  3. **Speech Bubble Tuning**: Verify that the speech bubble floats right over Bobi, types out smoothly, and automatically dismisses after 8 seconds.
  4. **Standalone Packaging**: Test launching the pre-built `release/mac-arm64/ErgoGotchi.app` (Mac) or `release/ErgoGotchi 1.0.0.exe` (Windows).

---

### 🐅 Developer 3: Cloud Brain, Tiger Data (TimescaleDB) & Gemini
- **Directory**: [`backend/`](backend/)
- **Guide**: [backend/DEV3_BACKEND_GUIDE.md](backend/DEV3_BACKEND_GUIDE.md)
- **Target Tracks**: Best Use of Gemini API, Best Use of Tiger Data, Best Use of Vultr, SpaceXSI A-Team
- **Tonight's Tasks**:
  1. **Gemini API Key**: Place your `GEMINI_API_KEY` into `.env` and verify that startup pre-warms 8 lines per cue.
  2. **Seed History**: Run `python backend/scripts/seed_history.py` to populate 2 hours of realistic focus/slouch data so the companion dashboard charts look full during judging.
  3. **Tiger Data Live Demo**: Test running `python backend/scripts/load_simulator.py` to show judges live 300 rows/second ingestion in the terminal.
  4. **Grok Bot Webhook**: Set `GROK_WEBHOOK_URL` in `.env` to a Discord channel webhook to qualify for the SpaceXSI track.

---

## ⚡ How Each Developer Works Independently

| Role | How to Run / Develop Without Blocking Others |
| :--- | :--- |
| **Dev 1** | Runs `npm test` for tests, and `npm run dev` to see live camera landmark coordinates in browser. |
| **Dev 2** | Runs `npm run dev` and `npm run electron`. Uses hotkeys <kbd>1</kbd>, <kbd>2</kbd>, <kbd>3</kbd> to test pet animations without moving in front of the camera! |
| **Dev 3** | Runs `.venv/bin/python backend/app/main.py` and `pytest backend/tests/test_engine.py`. Tests API endpoints via `curl` and scripts. |

---

## 🎭 3-Minute Live Judging Presentation Roles

| Presentation Segment | Speaker | What You Show & Say |
| :--- | :--- | :--- |
| **0:00 - 0:45 (The Hook)** | **Dev 2 (Mascot Lead)** | Point to the screen: *"Meet ErgoGotchi: an on-screen desktop pet whose health depends on your posture."* Click to pet Bobi (hearts pop up, chime plays). |
| **0:45 - 1:30 (The Slouch)** | **Dev 1 (Sensing Lead)** | Intentionally hunch forward and jut your chin at the camera (or press <kbd>2</kbd>). Bobi melts into a yellow puddle with a sweat drop, and Gemini serves a comic roast + `[CHIN TUCK]` stretch badge. |
| **1:30 - 2:15 (Tiger Data)** | **Dev 3 (Cloud Lead)** | Double-click Bobi to expand the **Companion Dashboard**. Walk through the 1-minute continuous aggregate chart `ergo_1min` and the strain velocity computed using windowed `LAG()` functions. Open terminal and run `load_simulator.py` showing 300 rows/second! |
| **2:15 - 2:45 (Privacy & Math)**| **Dev 1 (Sensing Lead)** | Explain the 5-second baseline calibration: *"Zero video egress—every frame is processed in client RAM. It measures personal relative drift, not arbitrary pixels, making it immune to camera height."* |
| **2:45 - 3:00 (The Revive)** | **Dev 2 (Mascot Lead)** | Sit tall and upright. Bobi executes a **360° backflip**, sparkles burst across the screen, and he returns to Thriving mode. *"ErgoGotchi transforms ergonomic wellness into an emotional, delightful companion."* |

---

## 🛡️ Hackathon Bulletproof Contingency Plan
- **What if venue Wi-Fi goes down?**
  ErgoGotchi has **15 built-in witty canned lines** and executes all vision, scoring, and sprite animations **100% on-device**. It works perfectly even with Wi-Fi completely disconnected!
- **What if venue lighting is harsh or dim?**
  Use hotkeys <kbd>1</kbd> (Thriving), <kbd>2</kbd> (Slouching), <kbd>3</kbd> (Wilted). You can demo any state instantly with a single keystroke.
- **What if PostgreSQL is not installed on the laptop?**
  ErgoGotchi automatically starts in SQLite emulation mode with zero configuration needed.
