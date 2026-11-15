"""ErgoGotchi FastAPI Server: Telemetry Ingestion, Tiger Data Aggregation & Gemini Coaching."""

import asyncio
import json
import logging
import os
import sys
from collections import deque
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Dict, List, Any, Optional

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.db.database import db
from app.gemini.engine import gemini_engine
from app.grok_bot.service import grok_bot

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("ergogotchi.main")

# Ring buffer for 1 Hz telemetry batch inserts with O(1) eviction
telemetry_buffer: deque[Dict[str, Any]] = deque(maxlen=settings.BUFFER_MAX_SIZE)
buffer_lock = asyncio.Lock()

# In-memory session summary cache with 30s TTL: session_id -> (timestamp, fingerprint_tuple, data_dict)
summary_cache: Dict[str, tuple[float, tuple, Dict[str, Any]]] = {}

async def flush_buffer_task():
    """Periodically flush telemetry buffer into TimescaleDB/SQLite."""
    while True:
        try:
            await asyncio.sleep(settings.FLUSH_INTERVAL_SECONDS)
            batch = []
            async with buffer_lock:
                if telemetry_buffer:
                    batch = list(telemetry_buffer)
                    telemetry_buffer.clear()

            if batch:
                try:
                    await db.insert_telemetry_batch(batch)
                    logger.debug("Successfully flushed %d telemetry records to database.", len(batch))
                except Exception as e:
                    logger.error("Error flushing telemetry buffer (%d records dropped): %s", len(batch), e, exc_info=True)
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error("Unexpected error in flush_buffer_task loop: %s", e)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting %s...", settings.APP_NAME)
    await db.connect()
    asyncio.create_task(gemini_engine.warm_cache(count=4))
    refiller = asyncio.create_task(gemini_engine.periodic_refill_loop(interval_seconds=180, count_per_cue=2))
    flusher = asyncio.create_task(flush_buffer_task())
    try:
        yield
    finally:
        # Shutdown
        logger.info("Shutting down %s...", settings.APP_NAME)
        flusher.cancel()
        refiller.cancel()
        try:
            await flusher
        except asyncio.CancelledError:
            pass
        try:
            await refiller
        except asyncio.CancelledError:
            pass

        # Final flush of remaining buffer
        async with buffer_lock:
            if telemetry_buffer:
                logger.info("Executing final flush of %d telemetry records...", len(telemetry_buffer))
                try:
                    await db.insert_telemetry_batch(list(telemetry_buffer))
                except Exception as e:
                    logger.error("Error during final shutdown telemetry flush: %s", e)
                telemetry_buffer.clear()

        await db.close()
        await grok_bot.aclose()

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
    """Computes session overview, baseline drift vectors, and cached 3-sentence Gemini coaching summary."""
    rows = await db.get_series(session_id, minutes=120)
    if not rows:
        return {
            "session_id": session_id,
            "summary": "No session telemetry recorded yet. Start sitting upright with your ErgoGotchi!",
            "stats": {
                "min_hp": 100,
                "avg_strain": 0.0,
                "peak_strain": 0.0,
                "avg_forward_head": 0.0,
                "avg_head_drop": 0.0,
                "minutes": 0,
                "avg_blink_rate": 15.0,
            }
        }

    n = len(rows)
    avg_strain = sum((r.get("avg_strain") or 0.0) for r in rows) / n
    peak_strain = max((r.get("peak_strain") or 0.0) for r in rows)
    avg_fhead = sum((r.get("avg_forward_head") or 0.0) for r in rows) / n
    avg_hdrop = sum((r.get("avg_head_drop") or 0.0) for r in rows) / n
    min_hp = int(min((100 if r.get("min_hp") is None else r["min_hp"]) for r in rows))
    avg_blink = sum((r.get("avg_blink_rate") or 15.0) for r in rows) / n

    stats = {
        "avg_strain": round(avg_strain, 3),
        "peak_strain": round(peak_strain, 3),
        "avg_forward_head": round(avg_fhead, 3),
        "avg_head_drop": round(avg_hdrop, 3),
        "min_hp": min_hp,
        "minutes": n,
        "avg_blink_rate": round(avg_blink, 1),
    }

    fingerprint = (n, min_hp, round(avg_strain, 1), round(avg_fhead, 2), round(avg_hdrop, 2))
    now = asyncio.get_running_loop().time()
    cached = summary_cache.get(session_id)
    if cached and (now - cached[0]) < 30.0 and cached[1] == fingerprint:
        return cached[2]

    summary = await gemini_engine.generate_session_summary(stats)
    result = {
        "session_id": session_id,
        "stats": stats,
        "summary": summary,
    }
    summary_cache[session_id] = (now, fingerprint, result)
    return result

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
            except json.JSONDecodeError as jde:
                logger.warning("Malformed JSON received on WebSocket (ignoring): %s | Raw payload: %.100s", jde, text_data)
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
                logger.info(
                    "Intervention requested [req_id=%s, reason=%s, hp=%s, worst_signal=%s]",
                    request_id, reason, context.get("hp"), context.get("worst_signal")
                )

                intervention = await gemini_engine.get_intervention(
                    request_id=request_id,
                    reason=reason,
                    context=context
                )
                logger.info(
                    "Intervention dispatched [req_id=%s, cue=%s, severity=%s, source=%s]",
                    request_id, intervention.get("cue"), intervention.get("severity"), intervention.get("source")
                )
                await websocket.send_text(json.dumps(intervention))

            # Health / Ping-Pong heartbeat
            elif msg_type == "ping":
                await websocket.send_text(json.dumps({"type": "pong", "ts": datetime.now(timezone.utc).isoformat()}))

            else:
                logger.debug("Received unhandled WebSocket message type: '%s'", msg_type)

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected.")
    except Exception as e:
        logger.error("WebSocket runtime error: %s", e, exc_info=True)

# Mount static files if frontend is built
dist_dir = os.path.join(os.path.dirname(__file__), "..", "..", "dist")
if not os.path.exists(dist_dir) and os.path.exists("dist"):
    dist_dir = "dist"

if os.path.exists(dist_dir):
    app.mount("/", StaticFiles(directory=dist_dir, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    app_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True, app_dir=app_dir)
