"""ErgoGotchi FastAPI Server: Telemetry Ingestion, Tiger Data Aggregation & Gemini Coaching."""

import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Dict, List, Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.db.database import db
from app.gemini.engine import gemini_engine
from app.grok_bot.service import grok_bot

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("ergogotchi.main")

# Memory buffer for 1 Hz telemetry batch inserts
telemetry_buffer: List[Dict[str, Any]] = []
buffer_lock = asyncio.Lock()

async def flush_buffer_task():
    """Periodically flush telemetry buffer into TimescaleDB/SQLite."""
    while True:
        await asyncio.sleep(settings.FLUSH_INTERVAL_SECONDS)
        batch = []
        async with buffer_lock:
            if telemetry_buffer:
                batch = list(telemetry_buffer)
                telemetry_buffer.clear()

        if batch:
            try:
                await db.insert_telemetry_batch(batch)
            except Exception as e:
                logger.error("Error flushing telemetry buffer: %s", e)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting %s...", settings.APP_NAME)
    await db.connect()
    asyncio.create_task(gemini_engine.warm_cache())
    flusher = asyncio.create_task(flush_buffer_task())
    yield
    # Shutdown
    flusher.cancel()
    # Final flush
    async with buffer_lock:
        if telemetry_buffer:
            await db.insert_telemetry_batch(telemetry_buffer)

app = FastAPI(title=settings.APP_NAME, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    stats = await db.get_stats()
    return {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "database": stats,
        "gemini_active": bool(settings.GEMINI_API_KEY)
    }

@app.get("/tiger-data/stats")
async def tiger_data_stats():
    """Returns TimescaleDB / Tiger Data operational metrics."""
    return await db.get_stats()

@app.get("/sessions/{session_id}/series")
async def get_session_series(session_id: str, minutes: int = Query(default=30, ge=1, le=1440)):
    """Returns 1-minute bucketed continuous aggregate data with strain velocity."""
    rows = await db.get_series(session_id, minutes)
    return {
        "session_id": session_id,
        "minutes": minutes,
        "count": len(rows),
        "data": rows
    }

@app.get("/sessions/{session_id}/summary")
async def get_session_summary(session_id: str):
    """Computes session overview and generates 3-sentence Gemini ergonomic coaching summary."""
    rows = await db.get_series(session_id, minutes=120)
    if not rows:
        return {
            "summary": "No session telemetry recorded yet. Start sitting upright with your ErgoGotchi!",
            "stats": {"min_hp": 100, "avg_strain": 0.0, "minutes": 0, "avg_blink_rate": 15}
        }

    avg_strain = sum(r["avg_strain"] for r in rows) / len(rows)
    min_hp = min(r["min_hp"] for r in rows)
    avg_blink = sum(r["avg_blink_rate"] for r in rows) / len(rows)
    stats = {
        "avg_strain": round(avg_strain, 3),
        "min_hp": min_hp,
        "minutes": len(rows),
        "avg_blink_rate": round(avg_blink, 1)
    }

    summary = await gemini_engine.generate_session_summary(stats)
    return {
        "session_id": session_id,
        "stats": stats,
        "summary": summary
    }

@app.post("/grok-bot/webhook")
async def dispatch_grok_bot(session_id: str):
    """Trigger SpaceXSI Grok Bot daily/session digest dispatch."""
    summary_resp = await get_session_summary(session_id)
    sent = await grok_bot.send_session_digest(
        session_id=session_id,
        summary_text=summary_resp["summary"],
        stats=summary_resp["stats"]
    )
    return {"dispatched": sent, "session_id": session_id}

@app.websocket("/ws")
async def websocket_telemetry(websocket: WebSocket, token: str = Query(default="")):
    """
    High-throughput bi-directional WebSocket endpoint:
    - Ingests Contract 1 (Telemetry) @ 1 Hz
    - Ingests Contract 2 (Intervention Request)
    - Emits Contract 3 (Intervention with Gemini Persona Joke & Biomechanical Cue)
    """
    # Shared secret verification
    if token != settings.SHARED_TOKEN and token != "dev":
        logger.warning("WebSocket rejected: invalid token '%s'", token)
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    logger.info("WebSocket client connected.")

    try:
        while True:
            text_data = await websocket.receive_text()
            try:
                msg = json.loads(text_data)
            except json.JSONDecodeError:
                continue

            msg_type = msg.get("type")

            # Contract 1: Telemetry (1 Hz from Edge Sensing)
            if msg_type == "telemetry":
                record = {
                    "recorded_at": msg.get("ts") or datetime.now(timezone.utc).isoformat(),
                    "session_id": msg.get("session_id", "default-session"),
                    "present": bool(msg.get("present", True)),
                    "forward_head": msg.get("forward_head"),
                    "head_drop": msg.get("head_drop"),
                    "lean_in": msg.get("lean_in"),
                    "head_pitch_deg": msg.get("head_pitch_deg"),
                    "shoulder_tilt_deg": msg.get("shoulder_tilt_deg"),
                    "blink_rate_1m": msg.get("blink_rate_1m"),
                    "strain_index": msg.get("strain_index"),
                    "hp": msg.get("hp"),
                    "state": msg.get("state")
                }
                async with buffer_lock:
                    telemetry_buffer.append(record)

            # Contract 2: Intervention Request (when a posture trigger fires)
            elif msg_type == "intervention_request":
                request_id = msg.get("request_id", "")
                reason = msg.get("reason", "SLOUCH")
                context = msg.get("context", {})

                intervention = await gemini_engine.get_intervention(
                    request_id=request_id,
                    reason=reason,
                    context=context
                )
                await websocket.send_text(json.dumps(intervention))

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected.")
    except Exception as e:
        logger.error("WebSocket runtime error: %s", e)

# Mount static files if frontend is built
if os.path.exists("dist"):
    app.mount("/", StaticFiles(directory="dist", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
