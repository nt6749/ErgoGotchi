"""Google Gemini Persona & Ergonomic Intervention Engine."""

import asyncio
import json
import logging
import os
import random
import re
from typing import Dict, List, Optional, Any

from app.config import settings

logger = logging.getLogger("ergogotchi.gemini")

def _safe_json_loads(raw_text: str) -> Dict[str, Any]:
    """Parse JSON safely even if the LLM wraps response in markdown code blocks or surrounding commentary."""
    text = (raw_text or "").strip()
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text, re.IGNORECASE)
    if match:
        text = match.group(1).strip()
    return json.loads(text)

# Fixed Biomechanical Stretch Cues & Instructions (never hallucinated by LLM)
STRETCH_INSTRUCTIONS: Dict[str, str] = {
    "CHIN_TUCK": "Pull your head straight back, hold 5 seconds, 3 times.",
    "SHOULDER_ROLL": "Roll both shoulders back and down, 5 times.",
    "SIT_BACK": "Slide your hips to the back of the chair.",
    "LOOK_AWAY": "Look at something 20 feet away for 20 seconds.",
    "STAND_UP": "Stand and walk for one minute.",
    "NONE": "Keep up the great posture!"
}

def _load_canned_lines() -> Dict[str, List[str]]:
    """Load default canned persona lines from canned_lines.json."""
    json_path = os.path.join(os.path.dirname(__file__), "canned_lines.json")
    try:
        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, dict) and data:
                return data
    except Exception as e:
        logger.error("Could not read canned_lines.json (%s), using emergency fallbacks.", e)
    return {cue: ["Keep up the great posture!"] for cue in STRETCH_INSTRUCTIONS}

# Rich clinical canned fallback lines loaded from canned_lines.json
CANNED_LINES: Dict[str, List[str]] = _load_canned_lines()
CANNED_SETS: Dict[str, frozenset[str]] = {k: frozenset(v) for k, v in CANNED_LINES.items()}

class GeminiPersonaEngine:
    def __init__(self):
        self.client = None
        self.cache: Dict[str, List[str]] = {k: list(v) for k, v in CANNED_LINES.items()}
        self.recent_lines: List[str] = []
        self._inflight_cues: set[str] = set()
        self._init_client()

    def _init_client(self):
        """Initialise google-genai client if API key is provided."""
        if not settings.GEMINI_API_KEY:
            logger.info("GEMINI_API_KEY not set. Using built-in witty persona lines and local cache.")
            return

        try:
            from google import genai
            from google.genai import types
            # Hard HTTP timeout so a slow/stuck Gemini request can't pin executor threads forever
            self.client = genai.Client(
                api_key=settings.GEMINI_API_KEY,
                http_options=types.HttpOptions(timeout=settings.GEMINI_TIMEOUT_MS),
            )
            logger.info("Google GenAI client initialised with model: %s", settings.GEMINI_MODEL)
        except Exception as e:
            logger.warning("Could not initialise Google GenAI SDK (%s). Running with canned fallbacks.", e)

    def _call_gemini_api(self, prompt: str, json_mode: bool = True) -> str:
        """Call Gemini via google-genai models.generate_content or interactions.create."""
        if not self.client:
            raise RuntimeError("Gemini client not initialized")

        # 1. Try models.generate_content (standard google-genai SDK)
        if hasattr(self.client, "models") and hasattr(self.client.models, "generate_content"):
            from google.genai import types
            config = types.GenerateContentConfig(response_mime_type="application/json") if json_mode else None
            res = self.client.models.generate_content(
                model=settings.GEMINI_MODEL,
                contents=prompt,
                config=config
            )
            return getattr(res, "text", "") or ""

        # 2. Try interactions.create (Interactions API)
        if hasattr(self.client, "interactions") and hasattr(self.client.interactions, "create"):
            fmt = {"type": "text", "mime_type": "application/json"} if json_mode else None
            kwargs = {"model": settings.GEMINI_MODEL, "input": prompt}
            if fmt:
                kwargs["response_format"] = fmt
            res = self.client.interactions.create(**kwargs)
            return getattr(res, "output_text", getattr(res, "text", "")) or ""

        raise RuntimeError("No compatible Gemini API method found on client")

    async def warm_cache(self, count: int = 4):
        """Pre-fetch fresh creative lines per cue in parallel to ensure 0ms response latency."""
        if not self.client:
            return

        logger.info("Pre-warming Gemini speech line cache (%d lines per cue)...", count)
        cues = ["CHIN_TUCK", "SHOULDER_ROLL", "SIT_BACK", "LOOK_AWAY", "STAND_UP"]
        tasks = [self._fetch_batch_lines(cue, count=count) for cue in cues]
        await asyncio.gather(*tasks, return_exceptions=True)
        logger.info("Gemini cache pre-warming complete.")

    async def periodic_refill_loop(self, interval_seconds: int = 180, count_per_cue: int = 2):
        """Continuously populate and refresh the pool with fresh creative Gemini lines in the background."""
        if not self.client:
            return

        logger.info(
            "Starting Gemini periodic pool refill task (every %ds, +%d lines per cue)...",
            interval_seconds,
            count_per_cue
        )
        cues = ["CHIN_TUCK", "SHOULDER_ROLL", "SIT_BACK", "LOOK_AWAY", "STAND_UP"]
        while True:
            try:
                await asyncio.sleep(interval_seconds)
                # Fetch fresh lines across cues in parallel
                tasks = [self._fetch_batch_lines(cue, count=count_per_cue) for cue in cues]
                await asyncio.gather(*tasks, return_exceptions=True)
                logger.debug("Periodic Gemini cache refill cycle completed.")
            except asyncio.CancelledError:
                logger.info("Gemini periodic refill loop cancelled.")
                break
            except Exception as e:
                logger.warning("Periodic Gemini cache refill cycle skipped: %s", e)

    async def _fetch_batch_lines(self, cue: str, count: int = 4):
        """Query Gemini for creative one-liner jokes corresponding to a cue."""
        if not self.client:
            return

        prompt = f"""
You are ErgoGotchi, a tiny desk creature living on the user's screen whose health depends directly on their posture.
Personality: dry, affectionate, witty, slightly sarcastic, never scolding or lecturing.
Task: Write {count} distinct, funny, short one-sentence lines urging the user to do the following action: {cue} ({STRETCH_INSTRUCTIONS.get(cue)}).

Rules:
1. Each line must be AT MOST 80 characters.
2. Exactly one sentence per line.
3. No emojis.
4. No medical or clinical claims.
5. Return JSON format: {{"lines": ["line 1", "line 2", ...]}}
"""
        try:
            loop = asyncio.get_running_loop()
            raw_text = await loop.run_in_executor(None, lambda: self._call_gemini_api(prompt, json_mode=True))
            data = _safe_json_loads(raw_text)
            lines = data.get("lines", [])
            cue_cache = self.cache.setdefault(cue, [])
            for line in lines:
                clean_line = line.strip().replace('"', '')
                if clean_line and len(clean_line) <= 90:
                    if len(cue_cache) >= 50:
                        cue_cache.pop(0)
                    cue_cache.append(clean_line)
            logger.info("Successfully cached %d fresh lines for cue %s (total: %d)", len(lines), cue, len(cue_cache))
        except Exception as e:
            logger.warning("Background Gemini warm-up failed for cue %s: %s", cue, e)

    def determine_cue(self, reason: str, context: Optional[Dict[str, Any]] = None) -> str:
        """Deterministically maps biometric telemetry context to a stretch cue."""
        if reason == "RECOVERED":
            return "NONE"
        if reason == "LOW_BLINK":
            return "LOOK_AWAY"
        if reason == "LONG_SESSION":
            return "STAND_UP"

        ctx = context if isinstance(context, dict) else {}
        worst_signal = str(ctx.get("worst_signal") or "forward_head")
        if worst_signal == "forward_head":
            return "CHIN_TUCK"
        elif worst_signal in ("head_drop", "head_pitch"):
            return "SHOULDER_ROLL"
        elif worst_signal in ("lean_in", "tilt"):
            return "SIT_BACK"

        return "CHIN_TUCK"

    async def get_intervention(
        self,
        request_id: str,
        reason: str,
        context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Deliver instant intervention line from warm cache, then trigger background refill.
        Guarantees sub-millisecond dispatch time to client.
        """
        ctx = context if isinstance(context, dict) else {}
        cue = self.determine_cue(reason, ctx)
        try:
            hp = float(ctx.get("hp", 50))
        except (ValueError, TypeError):
            hp = 50.0
        severity = "WARNING" if hp < 50 else "NUDGE"

        # 1. Fetch line from cache or canned fallback
        pool = self.cache.get(cue, [])
        source = "cache"

        if not pool:
            pool = CANNED_LINES.get(cue, CANNED_LINES["CHIN_TUCK"])
            source = "canned"

        # Pick from the newest lines (end of list) first so fresh Gemini lines aren't buried
        candidates = [line for line in pool if line not in self.recent_lines[-5:]]
        if not candidates:
            candidates = pool

        # If pool has grown beyond initial canned lines, prioritize the newest Gemini lines
        canned_set = CANNED_SETS.get(cue, frozenset())
        gemini_candidates = [line for line in candidates if line not in canned_set]
        if gemini_candidates:
            text = gemini_candidates[-1]
            source = "gemini"
        else:
            text = random.choice(candidates)

        self.recent_lines.append(text)
        if len(self.recent_lines) > 20:
            self.recent_lines.pop(0)

        # 2. Trigger asynchronous background generation with context (debounced per cue)
        if self.client and cue != "NONE" and cue not in self._inflight_cues:
            self._inflight_cues.add(cue)
            asyncio.create_task(self._generate_contextual_line(cue, reason, ctx))

        return {
            "type": "intervention",
            "v": 1,
            "request_id": request_id,
            "text": text,
            "cue": cue,
            "instruction": STRETCH_INSTRUCTIONS.get(cue, ""),
            "severity": severity,
            "source": source
        }

    async def _generate_contextual_line(self, cue: str, reason: str, context: Dict[str, Any]):
        """Generate a single context-aware line in background and add to cache."""
        try:
            prompt = f"""
You are ErgoGotchi, a cute desk companion whose life depends on user posture.
Current situation:
- User HP: {context.get('hp')} / 100
- Strain Index: {context.get('strain_index', 0.5)}
- Worst Signal: {context.get('worst_signal')}
- Session Time: {context.get('minutes_in_session', 30)} minutes
- Blink Rate: {context.get('blink_rate_1m', 10)} blinks/min
- Prescribed Cue: {cue}

Write ONE short, witty, affectionate comic line (max 85 characters, 1 sentence, no emojis, no medical claims).
Return JSON: {{"text": "..."}}
"""
            loop = asyncio.get_running_loop()
            raw_text = await loop.run_in_executor(None, lambda: self._call_gemini_api(prompt, json_mode=True))
            data = _safe_json_loads(raw_text)
            new_text = data.get("text", "").strip()
            if new_text and len(new_text) <= 90:
                cue_cache = self.cache.setdefault(cue, [])
                if len(cue_cache) >= 50:
                    cue_cache.pop(0)
                cue_cache.append(new_text)
                logger.info("Cached fresh background line for %s: '%s'", cue, new_text)
        except Exception as e:
            logger.warning("Background context line generation failed for cue '%s': %s", cue, e)
        finally:
            self._inflight_cues.discard(cue)

    async def generate_session_summary(self, session_stats: Optional[Dict[str, Any]] = None) -> str:
        """Generate a 3-sentence end-of-session ergonomic summary."""
        stats = session_stats if isinstance(session_stats, dict) else {}
        if not self.client:
            try:
                avg_strain = float(stats.get("avg_strain", 0.3) or 0.3)
            except (ValueError, TypeError):
                avg_strain = 0.3
            try:
                min_hp = 60 if stats.get("min_hp") is None else int(stats.get("min_hp"))
            except (ValueError, TypeError):
                min_hp = 60
            return (
                f"You completed a focused ergonomic session with a minimum pet HP of {min_hp}%. "
                f"Your average strain was kept at {avg_strain:.2f}, avoiding severe musculoskeletal stress. "
                "Keep taking regular micro-breaks to ensure your ErgoGotchi stays thriving!"
            )

        prompt = f"""
Write an encouraging 3-sentence summary of the user's coding work session based on these telemetry metrics:
- Average Strain Index: {stats.get('avg_strain', 0.3)} (0 is perfect, 1 is terrible)
- Minimum Mascot HP: {stats.get('min_hp', 75)}
- Total Active Minutes: {stats.get('minutes', 45)}
- Average Blinks per minute: {stats.get('avg_blink_rate', 12)}

Tone: Warm, motivating, ergonomic coach. Max 3 sentences. No bullet points.
"""
        try:
            loop = asyncio.get_running_loop()
            raw_text = await loop.run_in_executor(None, lambda: self._call_gemini_api(prompt, json_mode=False))
            return raw_text.strip()
        except Exception as e:
            logger.warning("Gemini session summary failed: %s", e)
            return "Great focus session! Your posture discipline kept ErgoGotchi healthy and energized."

gemini_engine = GeminiPersonaEngine()
