"""SpaceXSI Grok Bot / Discord / Slack notification service."""

import logging
from typing import Dict, Any, Optional
import httpx

from app.config import settings

logger = logging.getLogger("ergogotchi.grok")

class GrokBotService:
    @staticmethod
    async def send_session_digest(
        session_id: str,
        summary_text: str,
        stats: Dict[str, Any],
        webhook_url: Optional[str] = None
    ) -> bool:
        """Send personal, opt-in session ergonomic digest to configured webhook."""
        url = webhook_url or settings.GROK_WEBHOOK_URL
        if not url:
            logger.info("No webhook URL configured for Grok Bot. Skipping external dispatch.")
            return False

        payload = {
            "content": "🚀 **ErgoGotchi Posture & Ergonomics Debrief**",
            "embeds": [
                {
                    "title": f"Session Debrief: {session_id[:8]}",
                    "description": summary_text,
                    "color": 3066993 if stats.get("min_hp", 100) >= 50 else 15158332,
                    "fields": [
                        {
                            "name": "Mascot HP Low",
                            "value": f"{stats.get('min_hp', 100)} / 100",
                            "inline": True
                        },
                        {
                            "name": "Average Strain",
                            "value": f"{stats.get('avg_strain', 0.2):.2f}",
                            "inline": True
                        },
                        {
                            "name": "Blink Rate",
                            "value": f"{stats.get('avg_blink_rate', 14):.1f} bpm",
                            "inline": True
                        }
                    ],
                    "footer": {
                        "text": "ErgoGotchi · Privacy-First Ergonomic Telemetry · sunhacks 2026"
                    }
                }
            ]
        }

        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                res = await client.post(url, json=payload)
                if res.status_code < 300:
                    logger.info("Successfully dispatched Grok Bot digest to webhook.")
                    return True
                else:
                    logger.warning("Webhook returned status %d: %s", res.status_code, res.text)
                    return False
        except Exception as e:
            logger.error("Failed to post to Grok Bot webhook: %s", e)
            return False

grok_bot = GrokBotService()
