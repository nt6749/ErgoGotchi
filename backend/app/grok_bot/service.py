"""SpaceXSI Grok Bot — Autonomous Desk-Setup Diagnostician & Achievement Dispatcher."""

import asyncio
import logging
from typing import Dict, Any, Optional
import httpx

from app.config import settings

logger = logging.getLogger("ergogotchi.grok")

# Deterministic, zero-cost physical desk diagnoses & Next-Session Quests (never hallucinated by LLM)
DESK_DIAGNOSES: Dict[str, Dict[str, str]] = {
    "MONITOR_TOO_LOW": {
        "code": "MONITOR_TOO_LOW",
        "cause": "Vertical neck flexion (+Y-axis drop) — your screen is sitting below horizontal eye level.",
        "fix": "Stack 2 textbooks under your laptop (or raise your monitor ~2 inches) so the top of the screen meets eye level.",
        "quest": "Operation High Ground: Hold vertical head-drop drift under +6% next session.",
    },
    "SCREEN_MAGNET": {
        "code": "SCREEN_MAGNET",
        "cause": "Screen Magnet Effect (+Z-axis forward drift) — subconscious squinting into small code or distant text.",
        "fix": "Press Ctrl + = (Cmd + =) to bump your IDE font size by 2pt, or pull your monitor 3 inches closer.",
        "quest": "Falcon Eye Protocol: Keep forward-head drift under +5% for 30 mins.",
    },
    "OPTICAL_FIXATION": {
        "code": "OPTICAL_FIXATION",
        "cause": "Cognitive Optical Fixation — blink reflex suppressed below 9 bpm during deep focus.",
        "fix": "Drop screen brightness by 15% to reduce glare and blink deliberately every time you press Ctrl + S.",
        "quest": "20-20-20 Guardian: Maintain 12+ blinks/min across your next coding block.",
    },
    "LUMBAR_SLUMP": {
        "code": "LUMBAR_SLUMP",
        "cause": "Mid-Session Pelvic Slide — hips drifting forward away from the chair backrest.",
        "fix": "Wedge a rolled-up hoodie or small pillow behind your lower back and slide your hips all the way back.",
        "quest": "Iron Backrest: Finish a 25-min sprint without Bobi dropping below 60 HP.",
    },
    "DIALED_IN": {
        "code": "DIALED_IN",
        "cause": "Zero-Point Lock — monitor height, IDE font size, and viewing distance match your calibrated baseline.",
        "fix": "Change nothing! Keep your laptop/monitor and keyboard at this exact position.",
        "quest": "Flawless Streak: Chain a 2nd consecutive session with <5% baseline drift.",
    },
}


def _safe_int(val: Any, default: int) -> int:
    if val is None:
        return default
    try:
        return int(round(float(val)))
    except (ValueError, TypeError):
        return default


def _safe_float(val: Any, default: float) -> float:
    if val is None:
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return default


def _ascii_header(val: str) -> str:
    """Strip non-ASCII characters so httpx HTTP/1.1 headers never raise UnicodeEncodeError."""
    return val.encode("ascii", errors="ignore").decode("ascii").strip()


def _get_medal_tier(min_hp: int, avg_strain: float, fhead: float) -> tuple[str, str, int, str]:
    """Return (display_title, rank_label, embed_color_int, ntfy_tags) from session telemetry."""
    f_pct = fhead * 100.0
    if min_hp >= 80 and avg_strain < 0.30:
        return (
            f"🏆 Achievement Unlocked: Zero-Point Sniper (+{f_pct:.1f}% Drift)",
            f"🥇 Gold Calibration · {max(0, 100 - int(avg_strain * 100))}% Baseline Lock",
            16766720,  # Gold (#FFD700)
            "trophy,sparkles",
        )
    if min_hp >= 50:
        return (
            f"🥈 Achievement Unlocked: Desk Guardian ({min_hp} HP Floor)",
            "🥈 Silver Posture Medal",
            3066993,   # Emerald (#2ECC71)
            "medal_sports,white_check_mark",
        )
    return (
        "🎖️ Achievement Unlocked: The Backflip Revival!",
        "🥉 Resilience & Recovery Badge",
        10181046,  # Purple (#9B59B6)
        "military_medal,muscle",
    )


class GrokBotService:
    def __init__(self):
        self._client: Optional[httpx.AsyncClient] = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    def _get_client(self) -> httpx.AsyncClient:
        """Return a warm AsyncClient bound to the active running event loop."""
        loop = asyncio.get_running_loop()
        if self._client is None or self._client.is_closed or self._loop is not loop:
            self._client = httpx.AsyncClient(timeout=4.0)
            self._loop = loop
        return self._client

    async def aclose(self):
        """Cleanly close the shared HTTP client on FastAPI shutdown."""
        if self._client is not None and not self._client.is_closed:
            try:
                await self._client.aclose()
                logger.info("Closed GrokBotService HTTP client.")
            except Exception as e:
                logger.debug("Note closing GrokBotService client: %s", e)
        self._client = None
        self._loop = None

    @staticmethod
    def diagnose_desk_setup(stats: Optional[Dict[str, Any]] = None) -> Dict[str, str]:
        """
        Deterministically map relative baseline drift vectors (F/W, D/W, blink rate, strain)
        to a physical desk-setup cause, a $0 DIY fix, and a Next-Session Quest.
        """
        s = stats if isinstance(stats, dict) else {}
        fhead = _safe_float(s.get("avg_forward_head"), 0.04)
        hdrop = _safe_float(s.get("avg_head_drop"), 0.03)
        blink = _safe_float(s.get("avg_blink_rate"), 14.0)
        strain = _safe_float(s.get("avg_strain"), 0.20)
        min_hp = _safe_int(s.get("min_hp"), 100)

        # 1. High Y-axis head drop relative to Z-axis forward head -> Screen is too low
        if hdrop >= 0.08 and hdrop >= fhead * 1.15:
            return DESK_DIAGNOSES["MONITOR_TOO_LOW"]

        # 2. High Z-axis forward head projection -> Squinting / Screen Magnet effect
        if fhead >= 0.08:
            return DESK_DIAGNOSES["SCREEN_MAGNET"]

        # 3. Suppressed blink rate (< 9 bpm) -> Cognitive optical fixation
        if blink < 9.0:
            return DESK_DIAGNOSES["OPTICAL_FIXATION"]

        # 4. High overall strain or low HP floor -> Lower back / pelvic slump
        if strain >= 0.40 or min_hp < 50:
            return DESK_DIAGNOSES["LUMBAR_SLUMP"]

        # 5. All baseline vectors nominal -> Setup is dialed in
        return DESK_DIAGNOSES["DIALED_IN"]

    async def send_session_digest(
        self,
        session_id: Optional[str],
        summary_text: Optional[str],
        stats: Optional[Dict[str, Any]] = None,
        webhook_url: Optional[str] = None,
    ) -> bool:
        """Send an end-of-session medal card, deterministic desk diagnosis, and Next-Session Quest."""
        url = str(webhook_url if webhook_url is not None else settings.GROK_WEBHOOK_URL or "").strip()
        if not url:
            logger.info("No webhook URL configured for Grok Bot. Skipping external dispatch.")
            return False

        safe_stats = stats if isinstance(stats, dict) else {}
        min_hp = _safe_int(safe_stats.get("min_hp"), 100)
        avg_strain = _safe_float(safe_stats.get("avg_strain"), 0.20)
        peak_strain = _safe_float(safe_stats.get("peak_strain"), avg_strain)
        fhead_drift = _safe_float(safe_stats.get("avg_forward_head"), 0.04)
        hdrop_drift = _safe_float(safe_stats.get("avg_head_drop"), 0.03)
        avg_blink = _safe_float(safe_stats.get("avg_blink_rate"), 14.0)
        minutes = _safe_int(safe_stats.get("minutes"), 30)

        diagnosis = self.diagnose_desk_setup(safe_stats)
        default_title, default_rank, color, ntfy_tags = _get_medal_tier(min_hp, avg_strain, fhead_drift)
        title = str(safe_stats.get("achievement_title") or default_title)
        rank = str(safe_stats.get("achievement_rank") or default_rank)

        strain_label = "Low" if avg_strain < 0.30 else ("Moderate" if avg_strain < 0.55 else "High")
        blink_label = "Healthy" if avg_blink >= 10.0 else "Screen Stare"

        sid_short = str(session_id or "session")[:8]
        clean_summary = str(summary_text or "Bobi survived another coding session by your side!")

        reward_text = (
            f"{title}\n"
            f"Rank: {rank} (Session {sid_short})\n"
            f"\"{clean_summary}\"\n\n"
            f"📊 Biometric Telemetry ({minutes}m):\n"
            f"• 📐 Baseline Drift: +{fhead_drift * 100:.1f}% Fwd Head | +{hdrop_drift * 100:.1f}% Head Drop\n"
            f"• 👾 Bobi HP Floor: {min_hp}/100 | 🧬 Strain: {avg_strain:.2f} ({strain_label}) | 👁️ Blinks: {avg_blink:.1f} bpm\n\n"
            f"🔧 Desk-Setup Diagnosis [{diagnosis['code']}]: {diagnosis['cause']}\n"
            f"💡 $0 Instant Fix: {diagnosis['fix']}\n"
            f"🎯 Next-Session Quest: {diagnosis['quest']}"
        )

        url_lower = url.lower()
        client = self._get_client()

        try:
            # 1. ntfy.sh: strictly ASCII headers + UTF-8 body
            if "ntfy.sh" in url_lower:
                res = await client.post(
                    url,
                    content=reward_text.encode("utf-8"),
                    headers={
                        "Title": _ascii_header(f"{title} ({sid_short})") or f"ErgoGotchi ({sid_short})",
                        "Priority": "default",
                        "Tags": _ascii_header(ntfy_tags),
                    },
                )

            # 2. Google Chat & Slack: strict {"text": ...} schema (no Discord keys)
            elif "chat.googleapis.com" in url_lower or "slack.com" in url_lower:
                res = await client.post(url, json={"text": reward_text})

            # 3. Discord, Mattermost, webhook.site, httpbin.org
            else:
                payload = {
                    "text": reward_text,
                    "content": f"✨ **{title}**",
                    "embeds": [
                        {
                            "title": f"{rank} · Session {sid_short}",
                            "description": f"*\"{clean_summary}\"*",
                            "color": color,
                            "fields": [
                                {
                                    "name": "📐 Baseline Drift (F0 / D0)",
                                    "value": f"**+{fhead_drift * 100:.1f}%** Fwd · **+{hdrop_drift * 100:.1f}%** Drop",
                                    "inline": True,
                                },
                                {
                                    "name": "👾 Bobi's HP Floor",
                                    "value": f"**{min_hp} / 100** ({minutes}m)",
                                    "inline": True,
                                },
                                {
                                    "name": "🧬 Avg / Peak Strain",
                                    "value": f"**{avg_strain:.2f}** / **{peak_strain:.2f}** ({strain_label})",
                                    "inline": True,
                                },
                                {
                                    "name": "👁️ Blink Rate",
                                    "value": f"**{avg_blink:.1f} bpm** ({blink_label})",
                                    "inline": True,
                                },
                                {
                                    "name": f"🔧 Desk Diagnosis (`{diagnosis['code']}`) & $0 Fix",
                                    "value": f"{diagnosis['cause']}\n👉 **Fix:** {diagnosis['fix']}",
                                    "inline": False,
                                },
                                {
                                    "name": "🎯 Next-Session Quest",
                                    "value": f"**{diagnosis['quest']}**",
                                    "inline": False,
                                },
                            ],
                            "footer": {
                                "text": "ErgoGotchi · Autonomous Ergonomic Diagnostician · sunhacks 2026"
                            },
                        }
                    ],
                }
                res = await client.post(url, json=payload)

            if res.status_code < 300:
                logger.info("Successfully dispatched Grok Bot achievement & desk diagnosis.")
                return True
            else:
                logger.warning("Webhook returned status %d: %s", res.status_code, res.text)
                return False
        except Exception as e:
            logger.error("Failed to post to Grok Bot webhook: %s", e)
            return False


grok_bot = GrokBotService()
