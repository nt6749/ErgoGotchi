# 🦫 Developer 2: Mascot Experience, Desktop Shell & Companion Dashboard
> **Target Tracks Supported**: Best Mascot (Buc-ee's + XPPen Tablets), Future of Work  
> **Primary Language**: React / TypeScript / Tailwind CSS / Electron / Web Audio API  
> **Directory**: `src/dev2_mascot_and_ui/` & `electron/`

---

## 🎯 Your Mission Tonight
You own the **Mascot Personality, Visual Art & Physics Engine**, the **Transparent Electron Desktop Shell**, and the **Pop-Out Companion Dashboard**. Your goal is to make Bobi the Posture Blob so charming, expressive, and fun that judges immediately fall in love with the mascot!

---

## 📂 Files You Own
- **`MascotSprite.tsx`**: High-fidelity SVG character graphics, state animation loops (Thriving, Neutral, Slouching Puddle, Wilted Ghost, Calibrating, Away), petting squish physics, floating hearts (`♥`), and typewriter comic speech bubble.
- **`soundEffects.ts`**: Web Audio API procedural retro 8-bit sound synthesizer (petting harp, warning chime, slouch squish slide, and uplifting victory fanfare on posture revive). Zero external audio files required!
- **`Dashboard.tsx`**: Pop-out companion analytics view with 30-min strain velocity curves (`ergo_1min`), ocular blink rate timeline, biomechanical stretch guide, Tiger Data hypertable stats, and presenter hotkeys.
- **`electron/main.cjs` & `preload.cjs`**: Frameless, transparent, always-on-top Electron window, dynamic `setBounds` expansion for speech bubbles, right-click context menu, and packaging configuration.

---

## ⚡ How to Work & Test Independently
You do **not** need the camera or the backend server running to design and polish the mascot and dashboard!

```bash
# 1. Fast browser hot-reloading for UI iteration
npm run dev
# Open http://localhost:5173

# 2. Native Transparent Desktop Overlay testing
npm run electron

# 3. Test standalone application packaging (.app on Mac, .exe on Windows)
npm run package:mac
npm run package:win
```

### 🎮 Testing with Hotkeys
Instead of hunching over your camera during design iterations, use the presenter hotkeys:
- <kbd>1</kbd> : Force **Thriving** (bouncing slime, tiny headphones, golden sparkles)
- <kbd>2</kbd> : Force **Slouching** (melted yellow puddle, stress sweat drop, comic roast)
- <kbd>3</kbd> : Force **Wilted** (pale sleeping ghost, angel halo, "Zzz...")
- <kbd>4</kbd> : Return to Auto (camera tracking)
- <kbd>Click</kbd> : Pet Bobi to trigger squash physics, pink hearts, and harp chime!
- Sit upright from slouching to see the **360° backflip**!

---

## 🎨 Mascot State Matrix

| Pet State | Visual Representation | Sounds | Special Animation |
| :--- | :--- | :--- | :--- |
| **`THRIVING`** | Bouncing slime, tiny headphones, sparkles | Ambient bounce | `animate-bounce-slow` |
| **`NEUTRAL`** | Soft pastel mint blob, calm blinking eyes | Idle breath | `animate-pulse-subtle` |
| **`SLOUCHING`** | Flat melted puddle, blue sweat drop, wavy mouth | Sad squish slide | `animate-wobble` |
| **`WILTED`** | Floating ghost, angel halo, snoring `"Zzz..."` | Soft floating | `animate-float-fade` |
| **`CALIBRATING`** | Holographic cyan ring scanner | Scanning pulse | Holographic rotation |
| **`AWAY`** | Sleeping / looking around with `"?"` bubble | Quiet | Ethereal opacity |
| **`REVIVE`** | One-shot action upon recovering upright stance | Victory fanfare | Full **360° backflip**! |

---

## 🛠️ Tonight's Polish Checklist
1. **Backflip Animation Timing**: Verify the transition from Slouching to Thriving in `MascotSprite.tsx` feels snappy and triumphant.
2. **Speech Bubble Window Expansion**: In `electron/main.cjs`, ensure `petWindow.setBounds()` smoothly expands upward when Gemini speaks and shrinks back without flickering.
3. **Sound Effects Volume**: In `soundEffects.ts`, balance the oscillator gain so the petting chime and backflip sound crisp on laptop speakers without being abrasive.
4. **Standalone App Smoke Test**: Double-click `release/mac-arm64/ErgoGotchi.app` or `release/ErgoGotchi 1.0.0.exe` and confirm the transparent window floats cleanly over VS Code and Chrome.
