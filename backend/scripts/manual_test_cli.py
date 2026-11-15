#!/usr/bin/env python3
"""
👾 ErgoGotchi Interactive Manual Testing CLI
Allows developers and judges to simulate ergonomic posture events (slouch, low blink, etc.)
and test the Persona Engine, Biomechanical Cue Mapping, and Speech Dispatch in real-time.
"""

import asyncio
import os
import sys
import time

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.config import settings
from app.gemini.engine import gemini_engine, STRETCH_INSTRUCTIONS, CANNED_LINES
from app.db.database import db

# Colorful terminal helpers
BOLD = "\033[1m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
CYAN = "\033[96m"
MAGENTA = "\033[95m"
RESET = "\033[0m"

MASCOT_THRIVING = f"""{GREEN}
      (•‿•)   ✨
     /|   |\\   🎵
      /   \\
   [THRIVING]
{RESET}"""

MASCOT_SLOUCHING = f"""{YELLOW}
     ( -_- )  💧
     /|   |\\  ~melting~
    /______\\
   [SLOUCHING PUDDLE]
{RESET}"""

MASCOT_WILTED = f"""{RED}
      (x_x)   zzz
      /   \\   👻
     /_____\\
   [WILTED GHOST]
{RESET}"""

PRESET_SCENARIOS = {
    "1": {
        "title": "Slouch: Forward Head (Turtle Neck)",
        "reason": "SLOUCH",
        "worst_signal": "forward_head",
        "hp": 35,
        "strain": 0.85,
        "blink_rate": 8
    },
    "2": {
        "title": "Slouch: Head Drop (Looking down at lap/phone)",
        "reason": "SLOUCH",
        "worst_signal": "head_drop",
        "hp": 42,
        "strain": 0.70,
        "blink_rate": 10
    },
    "3": {
        "title": "Slouch: Head Pitch (Hunched shoulders)",
        "reason": "SLOUCH",
        "worst_signal": "head_pitch",
        "hp": 46,
        "strain": 0.65,
        "blink_rate": 9
    },
    "4": {
        "title": "Slouch: Leaning In / Screen Magnet",
        "reason": "SLOUCH",
        "worst_signal": "lean_in",
        "hp": 48,
        "strain": 0.60,
        "blink_rate": 11
    },
    "5": {
        "title": "Optical Fixation: Low Blink Rate (Screen Stare)",
        "reason": "LOW_BLINK",
        "worst_signal": "blink",
        "hp": 65,
        "strain": 0.50,
        "blink_rate": 3
    },
    "6": {
        "title": "Marathon Session: Glued to desk (>60 min)",
        "reason": "LONG_SESSION",
        "worst_signal": "session_time",
        "hp": 55,
        "strain": 0.40,
        "blink_rate": 12
    },
    "7": {
        "title": "Upright & Healthy Flow (Spinal Alignment)",
        "reason": "RECOVERED",
        "worst_signal": "none",
        "hp": 95,
        "strain": 0.12,
        "blink_rate": 16
    }
}


def print_banner():
    print(f"{CYAN}{BOLD}")
    print("==================================================================")
    print("    👾 ErgoGotchi Persona Engine & Biomechanics Testing CLI       ")
    print("==================================================================")
    print(f"{RESET}")
    has_key = bool(settings.GEMINI_API_KEY)
    status_str = f"{GREEN}ACTIVE ({settings.GEMINI_MODEL}){RESET}" if has_key else f"{YELLOW}OFFLINE FALLBACKS ONLY{RESET}"
    print(f"• Google Gemini API: {status_str}")
    print(f"• SQLite Database:   {GREEN}{settings.SQLITE_DB_PATH}{RESET}")
    print(f"• Canned Fallbacks:  {GREEN}{sum(len(v) for v in CANNED_LINES.values())} witty lines ready{RESET}")
    print("------------------------------------------------------------------\n")


async def test_scenario(scenario: dict):
    hp = scenario["hp"]
    reason = scenario["reason"]
    worst_signal = scenario["worst_signal"]

    # Mascot visualization
    if hp >= 70:
        mascot = MASCOT_THRIVING
    elif hp >= 30:
        mascot = MASCOT_SLOUCHING
    else:
        mascot = MASCOT_WILTED

    print(mascot)
    print(f"{BOLD}Scenario:{RESET} {scenario['title']}")
    print(f"• Simulated HP:     {hp}/100")
    print(f"• Trigger Reason:   {reason}")
    print(f"• Worst Signal:     {worst_signal}")

    t0 = time.time()
    resp = await gemini_engine.get_intervention(
        request_id=f"cli-test-{int(t0)}",
        reason=reason,
        context={
            "hp": hp,
            "worst_signal": worst_signal,
            "strain_index": scenario.get("strain", 0.5),
            "blink_rate_1m": scenario.get("blink_rate", 12),
            "minutes_in_session": 45
        }
    )
    elapsed_ms = (time.time() - t0) * 1000

    sev_color = RED if resp["severity"] == "WARNING" else YELLOW
    cue = resp["cue"]
    instruction = resp.get("instruction", "")

    print(f"\n{BOLD}{CYAN}--- Dispatched Persona Response ({elapsed_ms:.2f}ms) ---{RESET}")
    print(f"• Severity:          {sev_color}{resp['severity']}{RESET}")
    print(f"• Source:            {GREEN}{resp['source']}{RESET}")
    print(f"• Stretch Cue:       {BOLD}[{cue}]{RESET}")
    print(f"• Clinical Stretch:  {CYAN}{instruction}{RESET}")
    print(f"\n{BOLD}💬 ErgoGotchi says:{RESET}")
    print(f"   \"{BOLD}{resp['text']}{RESET}\"")
    print("-" * 66 + "\n")


async def generate_summary_demo():
    print(f"\n{BOLD}{MAGENTA}Generating 3-Sentence End-of-Session Coaching Summary...{RESET}")
    stats = {
        "avg_strain": 0.28,
        "min_hp": 45,
        "minutes": 90,
        "avg_blink_rate": 13.5
    }
    summary = await gemini_engine.generate_session_summary(stats)
    print(f"\n{GREEN}{BOLD}Session Report Summary:{RESET}")
    print(f"\"{summary}\"\n")


async def main_loop():
    print_banner()

    while True:
        print(f"{BOLD}Select a posture situation to simulate:{RESET}")
        for k, v in PRESET_SCENARIOS.items():
            print(f"  [{k}] {v['title']}")
        print("  [8] Custom Input (Enter your own HP & Signal)")
        print("  [9] Generate End-of-Session Summary")
        print("  [0] Exit")

        choice = input(f"\n{BOLD}Enter choice [0-9]: {RESET}").strip()

        if choice == "0":
            print("Exiting ErgoGotchi CLI. Keep sitting upright!")
            break
        elif choice in PRESET_SCENARIOS:
            await test_scenario(PRESET_SCENARIOS[choice])
        elif choice == "8":
            print(f"\n{BOLD}--- Custom Posture Simulation ---{RESET}")
            try:
                hp_val = float(input("Enter Pet HP (0 to 100) [e.g. 35]: ").strip() or "35")
            except ValueError:
                hp_val = 35.0

            print("Available signals: forward_head, head_drop, head_pitch, lean_in, tilt, LOW_BLINK, LONG_SESSION")
            sig = input("Enter Worst Signal or Reason [default: forward_head]: ").strip() or "forward_head"
            reason = "LOW_BLINK" if sig == "LOW_BLINK" else ("LONG_SESSION" if sig == "LONG_SESSION" else "SLOUCH")

            custom_scenario = {
                "title": f"Custom (HP: {hp_val}, Signal: {sig})",
                "reason": reason,
                "worst_signal": sig,
                "hp": hp_val,
                "strain": 0.75,
                "blink_rate": 8
            }
            await test_scenario(custom_scenario)
        elif choice == "9":
            await generate_summary_demo()
        else:
            print(f"{RED}Invalid option. Please choose 0-9.{RESET}\n")


if __name__ == "__main__":
    asyncio.run(main_loop())
