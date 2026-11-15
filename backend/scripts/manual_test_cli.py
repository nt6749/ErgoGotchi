#!/usr/bin/env python3
"""
👾 ErgoGotchi Interactive Manual Testing CLI with Full Trace Logging
Allows developers and judges to simulate ergonomic posture events (slouch, low blink, etc.)
and test the Persona Engine, Biomechanical Cue Mapping, and Speech Dispatch in real-time,
recording full step-by-step diagnostic traces both in the terminal and in backend/tests/manual_trace.log.
"""

import asyncio
import logging
import os
import sys
import time
from datetime import datetime, timezone

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
    print(f"• Google Gemini API:  {status_str}")
    print(f"• SQLite Database:    {GREEN}{settings.SQLITE_DB_PATH}{RESET}")
    print(f"• Canned Fallbacks:   {GREEN}{sum(len(v) for v in CANNED_LINES.values())} witty lines ready{RESET}")
    print(f"• Persistent Trace:   {CYAN}{TRACE_LOG_PATH}{RESET}")
    print("------------------------------------------------------------------\n")


async def test_scenario(scenario: dict):
    hp = scenario["hp"]
    reason = scenario["reason"]
    worst_signal = scenario["worst_signal"]
    strain = scenario.get("strain", 0.5)
    blink = scenario.get("blink_rate", 12)
    req_id = f"cli-test-{int(time.time() * 1000)}"

    # 1. Mascot visualization
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

    # Trace step 1: Raw Ingestion
    trace_msg_1 = f"[REQ {req_id}] [1. INGESTION] Scenario='{scenario['title']}' | HP={hp} | Reason={reason} | WorstSignal={worst_signal} | Strain={strain} | BlinkRate={blink}"
    trace_logger.info(trace_msg_1)
    print(f"\n{BOLD}{CYAN}🔍 Live Execution Trace:{RESET}")
    print(f"  {CYAN}▸ [1. INGESTION]{RESET} Reason={BOLD}{reason}{RESET}, WorstSignal={BOLD}{worst_signal}{RESET}, HP={BOLD}{hp}{RESET}")

    # Trace step 2: Biomechanical Cue Mapping
    t0 = time.time()
    cue = gemini_engine.determine_cue(reason, {"worst_signal": worst_signal})
    instruction = STRETCH_INSTRUCTIONS.get(cue, "")
    trace_msg_2 = f"[REQ {req_id}] [2. BIOMECHANICS] Mapped signal '{worst_signal}' -> Cue: [{cue}] | Instruction: '{instruction}'"
    trace_logger.info(trace_msg_2)
    print(f"  {CYAN}▸ [2. BIOMECHANICS]{RESET} Worst signal '{worst_signal}' mapped to Cue: {BOLD}[{cue}]{RESET}")
    print(f"  {CYAN}▸ [3. DIRECTIVE]{RESET} Clinical stretch: '{instruction}'")

    # Trace step 3: Severity Assessment
    severity = "WARNING" if hp < 50 else "NUDGE"
    trace_msg_3 = f"[REQ {req_id}] [3. SEVERITY] HP={hp} (<50 is WARNING) -> Severity: {severity}"
    trace_logger.info(trace_msg_3)
    sev_color = RED if severity == "WARNING" else YELLOW
    print(f"  {CYAN}▸ [4. SEVERITY]{RESET} HP {hp} evaluated -> Severity: {sev_color}{severity}{RESET}")

    # Trace step 4 & 5: Dispatch from Persona Engine
    pool_size = len(gemini_engine.cache.get(cue, []))
    resp = await gemini_engine.get_intervention(
        request_id=req_id,
        reason=reason,
        context={
            "hp": hp,
            "worst_signal": worst_signal,
            "strain_index": strain,
            "blink_rate_1m": blink,
            "minutes_in_session": 45
        }
    )
    elapsed_ms = (time.time() - t0) * 1000

    trace_msg_4 = f"[REQ {req_id}] [5. DISPATCH] PoolSize={pool_size} | Source={resp['source']} | Latency={elapsed_ms:.2f}ms | Text=\"{resp['text']}\""
    trace_logger.info(trace_msg_4)
    print(f"  {CYAN}▸ [5. DISPATCH]{RESET} Source={GREEN}{resp['source']}{RESET} (warm pool size: {pool_size}) in {GREEN}{elapsed_ms:.2f}ms{RESET}")

    print(f"\n{BOLD}{CYAN}--- Final Contract 3 Response Dispatched ({elapsed_ms:.2f}ms) ---{RESET}")
    print(f"• Severity:          {sev_color}{resp['severity']}{RESET}")
    print(f"• Source:            {GREEN}{resp['source']}{RESET}")
    print(f"• Stretch Cue:       {BOLD}[{cue}]{RESET}")
    print(f"• Clinical Stretch:  {CYAN}{instruction}{RESET}")
    print(f"\n{BOLD}💬 ErgoGotchi says:{RESET}")
    print(f"   \"{BOLD}{resp['text']}{RESET}\"")
    print(f"• Audit Log:         Saved to {TRACE_LOG_PATH}")
    print("-" * 66 + "\n")


async def generate_summary_demo():
    print(f"\n{BOLD}{MAGENTA}Generating 3-Sentence End-of-Session Coaching Summary...{RESET}")
    stats = {
        "avg_strain": 0.28,
        "min_hp": 45,
        "minutes": 90,
        "avg_blink_rate": 13.5
    }
    t0 = time.time()
    summary = await gemini_engine.generate_session_summary(stats)
    elapsed_ms = (time.time() - t0) * 1000

    trace_logger.info("[SUMMARY REPORT] Generated in %.2fms | Summary=\"%s\"", elapsed_ms, summary)
    print(f"\n{GREEN}{BOLD}Session Report Summary ({elapsed_ms:.2f}ms):{RESET}")
    print(f"\"{summary}\"\n")


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
        print("  [8] Custom Input (Enter your own HP & Signal)")
        print("  [9] Generate End-of-Session Coaching Summary")
        print("  [L] View Recent Diagnostic Trace Logs")
        print("  [0] Exit")

        choice = input(f"\n{BOLD}Enter choice [0-9, L]: {RESET}").strip().upper()

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
        elif choice == "L":
            view_recent_traces()
        else:
            print(f"{RED}Invalid option. Please choose 0-9 or L.{RESET}\n")


if __name__ == "__main__":
    asyncio.run(main_loop())
