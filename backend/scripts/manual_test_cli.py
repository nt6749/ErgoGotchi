#!/usr/bin/env python3
"""
👾 ErgoGotchi Full Diagnostic & Posture Simulation CLI
Displays ALL internal biometric variables, threshold equations, scoring ranges,
state transitions, and latency breakdowns, with full traceable logging.
"""

import asyncio
import logging
import os
import sys
import time
from datetime import datetime, timezone
from typing import Dict, Any

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.config import settings
from app.gemini.engine import gemini_engine, STRETCH_INSTRUCTIONS, CANNED_LINES
from app.db.database import db

# Setup dedicated manual trace logger
TRACE_LOG_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "tests", "manual_trace.log"))
os.makedirs(os.path.dirname(TRACE_LOG_PATH), exist_ok=True)

trace_logger = logging.getLogger("ergogotchi.manual_trace")
trace_logger.setLevel(logging.INFO)

file_handler = logging.FileHandler(TRACE_LOG_PATH, encoding="utf-8")
file_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", datefmt="%Y-%m-%d %H:%M:%S"))
trace_logger.addHandler(file_handler)

# Colorful terminal helpers
BOLD = "\033[1m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
CYAN = "\033[96m"
MAGENTA = "\033[95m"
BLUE = "\033[94m"
RESET = "\033[0m"

MASCOT_THRIVING = f"""{GREEN}
      (•‿•)   ✨ [BACKFLIP REVIVE!]
     /|   |\\   🎵
      /   \\
   [THRIVING]
{RESET}"""

MASCOT_SLOUCHING = f"""{YELLOW}
     ( -_- )  💧
     /|   |\\  ~melting into puddle~
    /______\\
   [SLOUCHING]
{RESET}"""

MASCOT_WILTED = f"""{RED}
      (x_x)   zzz
      /   \\   👻 [SPIRIT FLOATING]
     /_____\\
   [WILTED]
{RESET}"""

MASCOT_NEUTRAL = f"""{BLUE}
      (·_·)   
     /|   |\\  
      /   \\
   [NEUTRAL]
{RESET}"""


def clamp(val: float, low: float, high: float) -> float:
    return max(low, min(high, val))


def score_range(val: float, start: float, full: float) -> float:
    """Matches frontend pure TS scoreRange function."""
    if full == start:
        return 0.0
    clamped = clamp(val, min(start, full), max(start, full))
    return (clamped - start) / (full - start)


# Clinical signal calibration thresholds (matches src/scoring/scoring.ts)
THRESHOLDS = {
    "forward_head": {"start": 0.06, "full": 0.18, "unit": "ratio (F/W)"},
    "head_drop": {"start": 0.08, "full": 0.22, "unit": "ratio (D/W)"},
    "head_pitch_deg": {"start": 12.0, "full": 30.0, "unit": "degrees"},
    "lean_in": {"start": 0.10, "full": 0.30, "unit": "ratio (W/W0)"},
    "shoulder_tilt_deg": {"start": 4.0, "full": 12.0, "unit": "degrees"},
    "blink_rate_1m": {"start": 8.0, "full": 3.0, "unit": "bpm (inverted)"},
}

PRESET_SCENARIOS = {
    "1": {
        "title": "Severe Slouch: Forward Head (Turtle Neck)",
        "signals": {
            "forward_head": 0.16,
            "head_drop": 0.04,
            "head_pitch_deg": 8.0,
            "lean_in": 0.05,
            "shoulder_tilt_deg": 2.0,
            "blink_rate_1m": 12,
            "head_yaw_deg": 2.0,
        },
        "hp": 38,
        "prev_state": "NEUTRAL",
        "dwell_seconds": 6.0
    },
    "2": {
        "title": "Severe Slouch: Head Drop (Looking down at lap/phone)",
        "signals": {
            "forward_head": 0.04,
            "head_drop": 0.20,
            "head_pitch_deg": 10.0,
            "lean_in": 0.06,
            "shoulder_tilt_deg": 3.0,
            "blink_rate_1m": 11,
            "head_yaw_deg": 0.0,
        },
        "hp": 44,
        "prev_state": "NEUTRAL",
        "dwell_seconds": 5.5
    },
    "3": {
        "title": "Severe Slouch: Head Pitch (Hunched over keyboard)",
        "signals": {
            "forward_head": 0.05,
            "head_drop": 0.06,
            "head_pitch_deg": 28.0,
            "lean_in": 0.08,
            "shoulder_tilt_deg": 2.5,
            "blink_rate_1m": 10,
            "head_yaw_deg": 1.0,
        },
        "hp": 48,
        "prev_state": "NEUTRAL",
        "dwell_seconds": 7.0
    },
    "4": {
        "title": "Severe Slouch: Screen Magnet / Lean In",
        "signals": {
            "forward_head": 0.03,
            "head_drop": 0.04,
            "head_pitch_deg": 6.0,
            "lean_in": 0.28,
            "shoulder_tilt_deg": 2.0,
            "blink_rate_1m": 14,
            "head_yaw_deg": 0.0,
        },
        "hp": 49,
        "prev_state": "NEUTRAL",
        "dwell_seconds": 5.2
    },
    "5": {
        "title": "Optical Fixation: Low Blink Rate (Screen Stare Overload)",
        "signals": {
            "forward_head": 0.02,
            "head_drop": 0.02,
            "head_pitch_deg": 4.0,
            "lean_in": 0.02,
            "shoulder_tilt_deg": 1.0,
            "blink_rate_1m": 2,
            "head_yaw_deg": 0.0,
        },
        "hp": 65,
        "prev_state": "NEUTRAL",
        "dwell_seconds": 0.0
    },
    "6": {
        "title": "Marathon Session: Glued to desk (>60 min continuous)",
        "signals": {
            "forward_head": 0.05,
            "head_drop": 0.04,
            "head_pitch_deg": 6.0,
            "lean_in": 0.04,
            "shoulder_tilt_deg": 1.5,
            "blink_rate_1m": 12,
            "head_yaw_deg": 0.0,
        },
        "hp": 55,
        "prev_state": "NEUTRAL",
        "dwell_seconds": 0.0,
        "force_reason": "LONG_SESSION"
    },
    "7": {
        "title": "Spinal Revival: Straightening up after a Slouch (Trigger Backflip!)",
        "signals": {
            "forward_head": 0.01,
            "head_drop": 0.01,
            "head_pitch_deg": 2.0,
            "lean_in": 0.01,
            "shoulder_tilt_deg": 1.0,
            "blink_rate_1m": 16,
            "head_yaw_deg": 0.0,
        },
        "hp": 92,
        "prev_state": "SLOUCHING",
        "dwell_seconds": 0.0
    }
}


def compute_biomechanics_table(signals: dict) -> tuple:
    """Computes exact individual signal strain percentages and identifies maximum strain."""
    scores = {}

    # Multi-monitor head yaw guard
    yaw = signals.get("head_yaw_deg", 0.0)
    yaw_guard_active = abs(yaw) > 15.0

    if yaw_guard_active:
        scores["forward_head"] = 0.0
    else:
        scores["forward_head"] = score_range(signals["forward_head"], 0.06, 0.18)

    scores["head_drop"] = score_range(signals["head_drop"], 0.08, 0.22)
    scores["head_pitch_deg"] = score_range(signals["head_pitch_deg"], 12.0, 30.0)
    scores["lean_in"] = score_range(signals["lean_in"], 0.10, 0.30)
    scores["shoulder_tilt_deg"] = score_range(signals["shoulder_tilt_deg"], 4.0, 12.0)

    blink_raw = score_range(signals["blink_rate_1m"], 8.0, 3.0)
    scores["blink_rate_1m"] = 0.45 * blink_raw  # Capped below 0.5 threshold

    # Identify worst culprit (Maximum Rule)
    worst_name = "forward_head"
    worst_score = -1.0
    for name, s in scores.items():
        if s > worst_score:
            worst_score = s
            worst_name = name

    strain_index = clamp(worst_score, 0.0, 1.0)
    return scores, worst_name, strain_index, yaw_guard_active


def print_banner():
    print(f"{CYAN}{BOLD}")
    print("==================================================================")
    print("    👾 ErgoGotchi Telemetry & Biomechanical Diagnostics CLI       ")
    print("==================================================================")
    print(f"{RESET}")
    has_key = bool(settings.GEMINI_API_KEY)
    status_str = f"{GREEN}ACTIVE ({settings.GEMINI_MODEL}){RESET}" if has_key else f"{YELLOW}OFFLINE FALLBACKS{RESET}"
    print(f"• Google Gemini API:  {status_str}")
    print(f"• SQLite Database:    {GREEN}{settings.SQLITE_DB_PATH}{RESET}")
    print(f"• Built-in Cache:     {GREEN}{sum(len(v) for v in CANNED_LINES.values())} witty lines across 6 clinical cues{RESET}")
    print(f"• Diagnostic Log:     {CYAN}{TRACE_LOG_PATH}{RESET}")
    print("------------------------------------------------------------------\n")


async def run_diagnostics(scenario: dict):
    signals = scenario["signals"]
    current_hp = scenario["hp"]
    prev_state = scenario.get("prev_state", "NEUTRAL")
    dwell = scenario.get("dwell_seconds", 0.0)
    force_reason = scenario.get("force_reason")

    req_id = f"cli-diag-{int(time.time() * 1000)}"

    # 1. Compute Biomechanics Matrix
    scores, worst_name, strain_index, yaw_guard = compute_biomechanics_table(signals)

    # 2. Determine Trigger Reason
    if force_reason:
        reason = force_reason
    elif signals["blink_rate_1m"] < 8 and strain_index < 0.5:
        reason = "LOW_BLINK"
    elif strain_index >= 0.5:
        reason = "SLOUCH"
    else:
        reason = "RECOVERED"

    # Map signal name to determine_cue signal alias
    signal_map = {
        "forward_head": "forward_head",
        "head_drop": "head_drop",
        "head_pitch_deg": "head_pitch",
        "lean_in": "lean_in",
        "shoulder_tilt_deg": "tilt",
        "blink_rate_1m": "blink"
    }
    cue_signal = signal_map.get(worst_name, "forward_head")

    # 3. State Machine Transition Logic
    is_slouching = (dwell >= 5.0) or (strain_index >= 0.5 and dwell >= 5.0)

    if current_hp < 20:
        new_state = "WILTED"
    elif is_slouching:
        new_state = "SLOUCHING"
    elif current_hp >= 80 and strain_index < 0.3:
        new_state = "THRIVING"
    else:
        new_state = "NEUTRAL"

    # Revive Detection
    is_reviving = (prev_state in ("SLOUCHING", "WILTED")) and (new_state in ("THRIVING", "NEUTRAL"))

    # HP Dynamics
    if strain_index >= 0.5:
        decay_per_sec = 0.10 * strain_index
        hp_dynamic = f"{RED}Decaying (-{decay_per_sec:.3f} HP/s){RESET}"
    elif strain_index < 0.3:
        hp_dynamic = f"{GREEN}Recovering (+0.050 HP/s){RESET}"
    else:
        hp_dynamic = f"{YELLOW}Deadband Hold (0.000 HP/s){RESET}"

    # Mascot Art
    if new_state == "THRIVING":
        mascot = MASCOT_THRIVING
    elif new_state == "SLOUCHING":
        mascot = MASCOT_SLOUCHING
    elif new_state == "WILTED":
        mascot = MASCOT_WILTED
    else:
        mascot = MASCOT_NEUTRAL

    print(mascot)
    print(f"{BOLD}Scenario:{RESET} {scenario['title']}")

    # --- Section A: All Raw Biometrics & Thresholds ---
    print(f"\n{BOLD}{CYAN}1. 📊 All Biometric Inputs & Signal Strain Breakdown:{RESET}")
    print(f"   {'Signal Name':<18} | {'Raw Value':<10} | {'Threshold Range':<16} | {'Strain Score':<12} | {'Status'}")
    print("   " + "-" * 75)

    for name, raw in signals.items():
        if name == "head_yaw_deg":
            guard_str = f"{RED}ACTIVE (yaw > 15°){RESET}" if yaw_guard else f"{GREEN}Clear{RESET}"
            print(f"   {name:<18} | {raw:<10.1f} | {'|Yaw| > 15°':<16} | {'(Guard)':<12} | {guard_str}")
            continue

        thresh = THRESHOLDS[name]
        score = scores[name]
        pct_bar = f"{int(score * 100)}%"
        is_worst = (name == worst_name and score > 0)
        marker = f"{RED}{BOLD}◀ PEAK STRAIN{RESET}" if is_worst else (f"{YELLOW}Elevated{RESET}" if score > 0.3 else f"{GREEN}Nominal{RESET}")

        if "deg" in name or "tilt" in name:
            val_str = f"{raw:.1f}°"
            rng_str = f"{thresh['start']:.0f}° - {thresh['full']:.0f}°"
        elif "blink" in name:
            val_str = f"{raw} bpm"
            rng_str = f"{thresh['start']:.0f} - {thresh['full']:.0f} bpm"
        else:
            val_str = f"{raw:.3f}"
            rng_str = f"{thresh['start']:.2f} - {thresh['full']:.2f}"

        print(f"   {name:<18} | {val_str:<10} | {rng_str:<16} | {pct_bar:<12} | {marker}")

    print("   " + "-" * 75)
    print(f"   {BOLD}Aggregated Strain Index (Maximum Rule):{RESET} {BOLD}{strain_index:.2f}{RESET} / 1.00 (Culprit: {BOLD}{worst_name}{RESET})")

    # --- Section B: State Machine Transitions ---
    print(f"\n{BOLD}{CYAN}2. 🔄 State Machine & Health Points Dynamics:{RESET}")
    print(f"   • Current Pet HP:     {BOLD}{current_hp}/100{RESET}")
    print(f"   • HP Trajectory:      {hp_dynamic}")
    print(f"   • Dwell Accumulator:  {dwell:.1f}s (Threshold for Slouch: 5.0s) -> Slouching: {BOLD}{is_slouching}{RESET}")
    print(f"   • State Transition:   {MAGENTA}{prev_state}{RESET} ──► {BOLD}{new_state}{RESET}")
    if is_reviving:
        print(f"   • {GREEN}{BOLD}✨ REVIVAL EVENT TRIGGERED! (One-shot 360° backflip & celebration chimes!){RESET}")

    # --- Section C: Biomechanical Cue Mapping ---
    t0 = time.time()
    cue = gemini_engine.determine_cue(reason, {"worst_signal": cue_signal})
    instruction = STRETCH_INSTRUCTIONS.get(cue, "")

    # Severity Evaluation
    severity = "WARNING" if current_hp < 50 else "NUDGE"
    sev_color = RED if severity == "WARNING" else YELLOW

    # --- Section D: AI Persona Response & Dispatch ---
    pool_size = len(gemini_engine.cache.get(cue, []))
    resp = await gemini_engine.get_intervention(
        request_id=req_id,
        reason=reason,
        context={
            "hp": current_hp,
            "worst_signal": cue_signal,
            "strain_index": strain_index,
            "blink_rate_1m": signals.get("blink_rate_1m", 12),
            "minutes_in_session": 45
        }
    )
    elapsed_ms = (time.time() - t0) * 1000

    print(f"\n{BOLD}{CYAN}3. 💬 AI Persona Dispatch & Clinical Directive ({elapsed_ms:.2f}ms):{RESET}")
    print(f"   • Trigger Reason:     {BOLD}{reason}{RESET}")
    print(f"   • Prescribed Cue:     {BOLD}[{cue}]{RESET}")
    print(f"   • Clinical Stretch:   {CYAN}\"{instruction}\"{RESET}")
    print(f"   • Severity Level:     {sev_color}{severity}{RESET} (HP < 50 is WARNING)")
    print(f"   • Speech Line Source: {GREEN}{resp['source']}{RESET} (cache candidate pool: {pool_size} lines)")
    print(f"   • ErgoGotchi Says:    {BOLD}\"{resp['text']}\"{RESET}")

    # Record full trace to log file
    trace_entry = (
        f"[REQ {req_id}] [DIAGNOSTIC] Scenario='{scenario['title']}' | HP={current_hp} | "
        f"Strain={strain_index:.3f} | WorstSignal={worst_name} | PrevState={prev_state} -> NewState={new_state} | "
        f"Reviving={is_reviving} | Cue=[{cue}] | Severity={severity} | Source={resp['source']} | "
        f"Latency={elapsed_ms:.2f}ms | Text=\"{resp['text']}\""
    )
    trace_logger.info(trace_entry)
    print(f"\n   {BLUE}ℹ️ Diagnostic trace appended to: {TRACE_LOG_PATH}{RESET}")
    print("-" * 66 + "\n")


def view_recent_traces():
    print(f"\n{BOLD}{CYAN}=== Recent Diagnostic Trace Log (last 15 entries) ==={RESET}")
    if not os.path.exists(TRACE_LOG_PATH):
        print("No log entries recorded yet.")
        return
    with open(TRACE_LOG_PATH, "r", encoding="utf-8") as f:
        lines = f.readlines()
    for line in lines[-15:]:
        print(line.rstrip())
    print("-" * 66 + "\n")


async def main_loop():
    print_banner()

    while True:
        print(f"{BOLD}Select an action or posture situation to simulate:{RESET}")
        for k, v in PRESET_SCENARIOS.items():
            print(f"  [{k}] {v['title']}")
        print("  [8] Custom Input (Type your own Biometrics & HP)")
        print("  [L] View Diagnostic Log History")
        print("  [0] Exit")

        choice = input(f"\n{BOLD}Enter choice [0-8, L]: {RESET}").strip().upper()

        if choice == "0":
            print("Exiting ErgoGotchi CLI. Keep sitting upright!")
            break
        elif choice in PRESET_SCENARIOS:
            await run_diagnostics(PRESET_SCENARIOS[choice])
        elif choice == "8":
            print(f"\n{BOLD}--- Custom Biometric Posture Simulation ---{RESET}")
            try:
                hp_val = float(input("Enter Pet HP (0 to 100) [default 45]: ").strip() or "45")
            except ValueError:
                hp_val = 45.0

            try:
                f_head = float(input("Forward Head ratio (0.00 to 0.25) [default 0.14]: ").strip() or "0.14")
            except ValueError:
                f_head = 0.14

            try:
                h_drop = float(input("Head Drop ratio (0.00 to 0.30) [default 0.05]: ").strip() or "0.05")
            except ValueError:
                h_drop = 0.05

            try:
                pitch = float(input("Head Pitch degrees (0° to 45°) [default 15.0]: ").strip() or "15.0")
            except ValueError:
                pitch = 15.0

            try:
                blinks = int(input("Blink Rate per minute (1 to 25) [default 12]: ").strip() or "12")
            except ValueError:
                blinks = 12

            try:
                dwell = float(input("Slouch Dwell Seconds [default 5.0]: ").strip() or "5.0")
            except ValueError:
                dwell = 5.0

            custom_scenario = {
                "title": f"Custom Biometrics (HP: {hp_val}, ForwardHead: {f_head}, Pitch: {pitch}°)",
                "signals": {
                    "forward_head": f_head,
                    "head_drop": h_drop,
                    "head_pitch_deg": pitch,
                    "lean_in": 0.05,
                    "shoulder_tilt_deg": 2.0,
                    "blink_rate_1m": blinks,
                    "head_yaw_deg": 0.0,
                },
                "hp": hp_val,
                "prev_state": "NEUTRAL",
                "dwell_seconds": dwell
            }
            await run_diagnostics(custom_scenario)
        elif choice == "L":
            view_recent_traces()
        else:
            print(f"{RED}Invalid option. Please choose 0-8 or L.{RESET}\n")


if __name__ == "__main__":
    asyncio.run(main_loop())
