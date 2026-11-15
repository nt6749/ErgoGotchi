"""Google Gemini Persona & Ergonomic Intervention Engine."""

import asyncio
import json
import logging
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

# Rich clinical canned fallback lines (~75 lines for high variety offline / quota exhausted)
CANNED_LINES: Dict[str, List[str]] = {
    "CHIN_TUCK": [
        "You're folding like a lawn chair. Give your neck a break.",
        "Your chin is leading the way into your screen. Pull it back.",
        "I'm melting into a puddle down here. Retract that chin!",
        "Turtle mode detected. Let's tuck that chin back.",
        "Are you trying to smell the code? Pull your head back.",
        "My spine aches watching you inch toward the pixels. Chin tuck time.",
        "Head forward, pet HP backward. Retract that cranium.",
        "You look like a peering meerkat. Slide that head back into alignment.",
        "Cervical vertebrae distress call received. Double chin engaged!",
        "Your neck is working overtime for free. Pull it straight back.",
        "Stop inspecting individual pixels with your nose. Tuck your chin.",
        "Gravity called, it wants your posture back. Chin tuck for five seconds."
    ],
    "SHOULDER_ROLL": [
        "Your shoulders are trying to eat your ears. Roll them down.",
        "That hunch is turning me into a deflated balloon. Roll 'em back.",
        "Tension alert: drop those shoulders before my HP drops to zero.",
        "Shoulders up, HP down. Roll them back and breathe.",
        "You're wearing your shoulders as earrings. Roll them back down.",
        "Release the keyboard grip. Roll those shoulders back five times.",
        "Hunchback mode deactivated. Let's drop those traps.",
        "My squishy body is cramping. Drop and roll both shoulders.",
        "You're clenching like you're debugging production. Roll 'em back.",
        "Shoulder blades together, chest open. Breathe and relax.",
        "Those shoulders are halfway up your neck. Drop them down.",
        "Uncurl that upper back before I turn into a permanent pancake."
    ],
    "SIT_BACK": [
        "You're inching into the screen. Slide your hips to the back.",
        "Gravity is winning. Reclaim your chair backrest.",
        "Leaning tower of programmer. Push yourself back.",
        "Sit back into your chair, we're losing altitude down here.",
        "Your chair has a backrest for a reason. Use it!",
        "Screen tractor beam detected. Slide those hips back.",
        "You're tilting like a sailboat in a storm. Center yourself.",
        "Back up from the glass, human. Reclaim your lumbar support.",
        "Hips all the way back into the chair seat. We need stability.",
        "You're hovering over the desk. Lean back and let the chair work.",
        "Center of gravity compromised. Slide your pelvis back.",
        "Recline into comfort. Your lower spine will thank you."
    ],
    "LOOK_AWAY": [
        "Your eyes haven't blinked in forever. Look at a distant wall.",
        "Blink check! Look away before both of us turn into stone.",
        "Screen stare overload. Find something 20 feet away for 20s.",
        "Give your retinas a breather. Glance out the window.",
        "Stare down a distant horizon. Give your eye muscles a break.",
        "The screen will still be here in 20 seconds. Look across the room.",
        "Are your corneas dried out yet? Look at something 20 feet away.",
        "Optical fatigue warning: twenty feet, twenty seconds, right now.",
        "Blink those eyelids, you're not an owl. Focus on the far wall.",
        "Rest those pupils. Glare at the ceiling or out the window.",
        "Blue light overdose in progress. Look away and blink five times.",
        "Give your optic nerve a holiday. Find a distant object to admire."
    ],
    "STAND_UP": [
        "Marathon session detected! Stand up and stretch your legs.",
        "We've been glued to this desk for too long. Stand up!",
        "My pixels are cramping. Stand up and walk for one minute.",
        "Desk hibernation time is up. Stand up and stretch.",
        "Circulation check! Rise from your throne and take a lap.",
        "You've bonded with that chair at a molecular level. Stand up!",
        "One minute walking break. The code will compile while you're up.",
        "Leg muscles requesting permission to exist. Stand tall!",
        "Break the sedentary spell. Stand, stretch, and grab some water.",
        "Desk gravity has trapped you for an hour. Stand and shake it off.",
        "Get on your feet for sixty seconds. Your pet demands movement!",
        "Unfold those hip flexors. Stand up and take a quick victory lap."
    ],
    "NONE": [
        "Upright and thriving! Keep this posture going.",
        "Pure ergonomic perfection. I feel unstoppable!",
        "Flawless spine alignment. We're cruising now.",
        "Spine of steel! I am energized and glowing.",
        "Posture royalty detected. Bobi approves this alignment!",
        "Zero strain, maximum flow. We're an unstoppable duo."
    ]
}

class GeminiPersonaEngine:
    def __init__(self):
        self.client = None
        self.cache: Dict[str, List[str]] = {k: list(v) for k, v in CANNED_LINES.items()}
        self.recent_lines: List[str] = []
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

    async def warm_cache(self):
        """Pre-fetch 8 fresh creative lines per cue at startup to ensure 0ms response latency."""
        if not self.client:
            return

        logger.info("Pre-warming Gemini speech line cache...")
        for cue in ["CHIN_TUCK", "SHOULDER_ROLL", "SIT_BACK", "LOOK_AWAY", "STAND_UP"]:
            asyncio.create_task(self._fetch_batch_lines(cue, count=4))

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
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda: self.client.interactions.create(
                    model=settings.GEMINI_MODEL,
                    input=prompt,
                    response_format={"type": "text", "mime_type": "application/json"}
                )
            )
            data = _safe_json_loads(response.output_text)
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

        # Pick line avoiding immediate repetitions
        candidates = [line for line in pool if line not in self.recent_lines[-5:]]
        if not candidates:
            candidates = pool

        text = random.choice(candidates)
        self.recent_lines.append(text)
        if len(self.recent_lines) > 20:
            self.recent_lines.pop(0)

        # 2. Trigger asynchronous background generation with context
        if self.client:
            asyncio.create_task(self._generate_contextual_line(cue, reason, context))

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
- User HP: {context.get('hp')}/100
- Strain Index: {context.get('strain_index', 0.5)}
- Worst Signal: {context.get('worst_signal')}
- Session Time: {context.get('minutes_in_session', 30)} minutes
- Blink Rate: {context.get('blink_rate_1m', 10)} blinks/min
- Prescribed Cue: {cue}

Write ONE short, witty, affectionate comic line (max 85 characters, 1 sentence, no emojis, no medical claims).
Return JSON: {{"text": "..."}}
"""
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda: self.client.interactions.create(
                    model=settings.GEMINI_MODEL,
                    input=prompt,
                    response_format={"type": "text", "mime_type": "application/json"}
                )
            )
            data = _safe_json_loads(response.output_text)
            new_text = data.get("text", "").strip()
            if new_text and len(new_text) <= 90:
                cue_cache = self.cache.setdefault(cue, [])
                if len(cue_cache) >= 50:
                    cue_cache.pop(0)
                cue_cache.append(new_text)
                logger.info("Cached fresh background line for %s: '%s'", cue, new_text)
        except Exception as e:
            logger.warning("Background context line generation failed for cue '%s': %s", cue, e)

    async def generate_session_summary(self, session_stats: Optional[Dict[str, Any]] = None) -> str:
        """Generate a 3-sentence end-of-session ergonomic summary."""
        stats = session_stats if isinstance(session_stats, dict) else {}
        if not self.client:
            try:
                avg_strain = float(stats.get("avg_strain", 0.3) or 0.3)
            except (ValueError, TypeError):
                avg_strain = 0.3
            try:
                min_hp = int(stats.get("min_hp", 60) or 60)
            except (ValueError, TypeError):
                min_hp = 60
            return (
                f"You completed a focused ergonomic session with a minimum pet HP of {min_hp}%. "
                f"Your average strain was kept at {avg_strain:.2f}, avoiding severe musculoskeletal stress. "
                "Keep taking regular micro-breaks to ensure your ErgoGotchi stays thriving!"
            )

        prompt = f"""
Write an encouraging 3-sentence summary of the user's coding work session based on these telemetry metrics:
- Average Strain Index: {session_stats.get('avg_strain', 0.3)} (0 is perfect, 1 is terrible)
- Minimum Mascot HP: {session_stats.get('min_hp', 75)}
- Total Active Minutes: {session_stats.get('minutes', 45)}
- Average Blinks per minute: {session_stats.get('avg_blink_rate', 12)}

Tone: Warm, motivating, ergonomic coach. Max 3 sentences. No bullet points.
"""
        try:
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda: self.client.interactions.create(
                    model=settings.GEMINI_MODEL,
                    input=prompt
                )
            )
            return response.output_text.strip()
        except Exception as e:
            logger.warning("Gemini session summary failed: %s", e)
            return "Great focus session! Your posture discipline kept ErgoGotchi healthy and energized."

gemini_engine = GeminiPersonaEngine()
