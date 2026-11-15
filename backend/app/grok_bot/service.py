"""SpaceXSI Grok Bot / Discord / Slack notification service."""

import asyncio
import logging
from typing import Dict, Any, Optional
import httpx

from app.config import settings

logger = logging.getLogger("ergogotchi.grok")

class GrokBotService:
    def __init__(self):
        self._client: Optional[httpx.AsyncClient] = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    def _get_client(self) -> httpx.AsyncClient:
        loop = asyncio.get_running_loop()
        if self._client is None or self._client.is_closed or self._loop is not loop:
            self._client = httpx.AsyncClient(timeout=4.0)
            self._loop = loop
        return self._client

    async def aclose(self):
        """Cleanly close underlying HTTP connection pool."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()
        self._client = None
        self._loop = None

    async def send_session_digest(
        self,
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

        sid_short = str(session_id or "session")[:8]
        payload = {
            "content": "🚀 **ErgoGotchi Posture & Ergonomics Debrief**",
            "embeds": [
                {
                    "title": f"Session Debrief: {sid_short}",
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
            client = self._get_client()
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
