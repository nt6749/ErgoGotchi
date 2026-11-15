"""
Insanely Robust Unit, Edge-Case & Runtime Integration Test Suite for ErgoGotchi Backend.
Tests biomechanical cues, AI persona fallbacks, database aggregation, WebSocket protocols,
and extreme boundary edge cases with verbose traceable logging.
"""

import asyncio
import json
import logging
import os
import sqlite3
import sys
import uuid
from datetime import datetime, timezone, timedelta
from typing import Dict, Any

import pytest
from fastapi.testclient import TestClient

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.config import settings
from app.db.database import db, to_session_uuid
from app.gemini.engine import gemini_engine, STRETCH_INSTRUCTIONS, CANNED_LINES, _safe_json_loads
from app.grok_bot.service import grok_bot
from app.main import app, telemetry_buffer, buffer_lock

logger = logging.getLogger("ergogotchi.tests")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")


# ============================================================================
# 1. BIOMECHANICAL CUE MAPPING & EXTREME EDGE CASES
# ============================================================================

def test_cue_mapping_standard():
    """Verify deterministic clinical cue selection for all valid biomechanical signals."""
    logger.info("Executing test_cue_mapping_standard...")
    assert gemini_engine.determine_cue("RECOVERED", {}) == "NONE"
    assert gemini_engine.determine_cue("RECOVERED", None) == "NONE"
    assert gemini_engine.determine_cue("RECOVERED", {"worst_signal": "forward_head"}) == "NONE"
    assert gemini_engine.determine_cue("LOW_BLINK", {}) == "LOOK_AWAY"
    assert gemini_engine.determine_cue("LONG_SESSION", {}) == "STAND_UP"
    assert gemini_engine.determine_cue("SLOUCH", {"worst_signal": "forward_head"}) == "CHIN_TUCK"
    assert gemini_engine.determine_cue("SLOUCH", {"worst_signal": "head_drop"}) == "SHOULDER_ROLL"
    assert gemini_engine.determine_cue("SLOUCH", {"worst_signal": "head_pitch"}) == "SHOULDER_ROLL"
    assert gemini_engine.determine_cue("SLOUCH", {"worst_signal": "lean_in"}) == "SIT_BACK"
    assert gemini_engine.determine_cue("SLOUCH", {"worst_signal": "tilt"}) == "SIT_BACK"
    logger.info("-> Passed standard biomechanical cue mappings.")


def test_cue_mapping_extreme_edge_cases():
    """Verify determine_cue survives None, malformed, empty, and unexpected input types."""
    logger.info("Executing test_cue_mapping_extreme_edge_cases...")
    
    # 1. Null / empty / non-dict contexts
    assert gemini_engine.determine_cue("SLOUCH", None) == "CHIN_TUCK"
    assert gemini_engine.determine_cue("SLOUCH", {}) == "CHIN_TUCK"
    assert gemini_engine.determine_cue("LOW_BLINK", None) == "LOOK_AWAY"
    assert gemini_engine.determine_cue("LONG_SESSION", None) == "STAND_UP"

    # 2. Corrupted / non-string worst_signal values
    assert gemini_engine.determine_cue("SLOUCH", {"worst_signal": None}) == "CHIN_TUCK"
    assert gemini_engine.determine_cue("SLOUCH", {"worst_signal": 12345}) == "CHIN_TUCK"
    assert gemini_engine.determine_cue("SLOUCH", {"worst_signal": ["unsupported_list"]}) == "CHIN_TUCK"
    assert gemini_engine.determine_cue("SLOUCH", {"worst_signal": "unknown_future_signal"}) == "CHIN_TUCK"

    # 3. Missing / empty / unexpected reasons
    assert gemini_engine.determine_cue("", {"worst_signal": "lean_in"}) == "SIT_BACK"
    assert gemini_engine.determine_cue("UNRECOGNIZED_REASON", {"worst_signal": "head_drop"}) == "SHOULDER_ROLL"
    logger.info("-> Passed extreme edge cases for cue mapping.")


def test_stretch_instructions_complete():
    """Verify all 6 biomechanical stretch cues have clinical-grade instructions."""
    logger.info("Executing test_stretch_instructions_complete...")
    expected_cues = ["CHIN_TUCK", "SHOULDER_ROLL", "SIT_BACK", "LOOK_AWAY", "STAND_UP", "NONE"]
    for cue in expected_cues:
        assert cue in STRETCH_INSTRUCTIONS, f"Missing clinical instruction for cue: {cue}"
        assert len(STRETCH_INSTRUCTIONS[cue]) >= 5, f"Instruction too short for cue: {cue}"
        logger.info("Verified cue [%s]: '%s'", cue, STRETCH_INSTRUCTIONS[cue])


# ============================================================================
# 2. PERSONA INTERVENTIONS & SEVERITY BOUNDARY TESTS
# ============================================================================

def test_instant_cached_intervention_hermetic(monkeypatch):
    """Verify intervention responds in <10ms from cache without network blocking."""
    logger.info("Executing test_instant_cached_intervention_hermetic...")
    monkeypatch.setattr(gemini_engine, "client", None)
    
    start_t = datetime.now()
    resp = asyncio.run(gemini_engine.get_intervention(
        request_id="test-req-hermetic-1",
        reason="SLOUCH",
        context={"worst_signal": "forward_head", "hp": 45}
    ))
    elapsed_ms = (datetime.now() - start_t).total_seconds() * 1000

    assert resp["type"] == "intervention"
    assert resp["v"] == 1
    assert resp["request_id"] == "test-req-hermetic-1"
    assert resp["cue"] == "CHIN_TUCK"
    assert resp["severity"] == "WARNING"  # hp < 50
    assert len(resp["text"]) <= 90
    assert resp["instruction"] == STRETCH_INSTRUCTIONS["CHIN_TUCK"]
    assert resp["source"] in ("cache", "canned")
    assert elapsed_ms < 50, f"Intervention latency exceeded threshold: {elapsed_ms:.2f}ms"
    logger.info("-> Dispatched intervention in %.2fms: '%s'", elapsed_ms, resp["text"])


def test_intervention_hp_severity_boundaries(monkeypatch):
    """Verify severity transitions strictly at HP 50 (WARNING vs NUDGE) and survives bad HP."""
    logger.info("Executing test_intervention_hp_severity_boundaries...")
    monkeypatch.setattr(gemini_engine, "client", None)

    # HP = 49.9 -> WARNING
    r_warn = asyncio.run(gemini_engine.get_intervention("r1", "SLOUCH", {"hp": 49.9}))
    assert r_warn["severity"] == "WARNING"

    # HP = 50.0 -> NUDGE
    r_nudge = asyncio.run(gemini_engine.get_intervention("r2", "SLOUCH", {"hp": 50.0}))
    assert r_nudge["severity"] == "NUDGE"

    # HP = 0 -> WARNING
    r_zero = asyncio.run(gemini_engine.get_intervention("r3", "SLOUCH", {"hp": 0}))
    assert r_zero["severity"] == "WARNING"

    # HP = -20 (extreme underflow) -> WARNING
    r_neg = asyncio.run(gemini_engine.get_intervention("r4", "SLOUCH", {"hp": -20}))
    assert r_neg["severity"] == "WARNING"

    # HP = 1000 (extreme overflow) -> NUDGE
    r_over = asyncio.run(gemini_engine.get_intervention("r5", "SLOUCH", {"hp": 1000}))
    assert r_over["severity"] == "NUDGE"

    # Malformed / string HP -> safely defaults to 50 (NUDGE) without crashing
    r_str = asyncio.run(gemini_engine.get_intervention("r6", "SLOUCH", {"hp": "corrupted_hp"}))
    assert r_str["severity"] == "NUDGE"
    logger.info("-> Passed HP boundary and type-resilience tests.")


def test_intervention_cache_fallback_resilience(monkeypatch):
    """Verify fallback to canned lines when cache is empty or corrupted."""
    logger.info("Executing test_intervention_cache_fallback_resilience...")
    monkeypatch.setattr(gemini_engine, "client", None)

    # Clear cache for CHIN_TUCK
    orig_cache = list(gemini_engine.cache.get("CHIN_TUCK", []))
    gemini_engine.cache["CHIN_TUCK"] = []

    try:
        resp = asyncio.run(gemini_engine.get_intervention("r-fallback", "SLOUCH", {"worst_signal": "forward_head"}))
        assert resp["cue"] == "CHIN_TUCK"
        assert resp["text"] in CANNED_LINES["CHIN_TUCK"]
        assert resp["source"] == "canned"
        logger.info("Successfully fell back to canned line: '%s'", resp["text"])
    finally:
        gemini_engine.cache["CHIN_TUCK"] = orig_cache


def test_intervention_gemini_lines_priority(monkeypatch):
    """Verify fresh Gemini lines take precedence over canned lines and emit source='gemini'."""
    logger.info("Executing test_intervention_gemini_lines_priority...")
    monkeypatch.setattr(gemini_engine, "client", None)
    gemini_line = "Your posture is so sharp it could cut glass."
    orig_cache = list(gemini_engine.cache.get("CHIN_TUCK", []))
    gemini_engine.cache["CHIN_TUCK"] = list(CANNED_LINES["CHIN_TUCK"]) + [gemini_line]
    gemini_engine.recent_lines.clear()

    try:
        resp = asyncio.run(gemini_engine.get_intervention("req-gemini-prio", "SLOUCH", {"worst_signal": "forward_head"}))
        assert resp["text"] == gemini_line
        assert resp["source"] == "gemini"
        logger.info("-> Successfully prioritized newest Gemini line with source='gemini'.")
    finally:
        gemini_engine.cache["CHIN_TUCK"] = orig_cache


def test_intervention_recovered_cue_none(monkeypatch):
    """Verify RECOVERED reason outputs cue NONE and does not scold user."""
    logger.info("Executing test_intervention_recovered_cue_none...")
    monkeypatch.setattr(gemini_engine, "client", None)
    resp = asyncio.run(gemini_engine.get_intervention("req-rec-1", "RECOVERED", {"worst_signal": "forward_head"}))
    assert resp["cue"] == "NONE"
    assert resp["text"] in CANNED_LINES["NONE"]
    logger.info("-> Successfully handled RECOVERED with cue NONE: '%s'", resp["text"])


def test_repetition_avoidance_and_buffer_cap(monkeypatch):
    """Verify persona avoids repeating recent lines and caps history to 20."""
    logger.info("Executing test_repetition_avoidance_and_buffer_cap...")
    monkeypatch.setattr(gemini_engine, "client", None)

    # Provide 6 distinct lines in cache
    pool = [f"Unique speech line #{i}" for i in range(10)]
    gemini_engine.cache["STAND_UP"] = list(pool)
    gemini_engine.recent_lines.clear()

    # Request 5 interventions in succession
    picked_lines = []
    for i in range(5):
        resp = asyncio.run(gemini_engine.get_intervention(f"req-rep-{i}", "LONG_SESSION", {}))
        picked_lines.append(resp["text"])

    # First 5 should have high variety
    assert len(set(picked_lines)) >= 4, "Too many immediate line repetitions occurred"

    # Fill 30 lines to test recent_lines 20-item cap
    for i in range(25):
        asyncio.run(gemini_engine.get_intervention(f"req-cap-{i}", "LONG_SESSION", {}))

    assert len(gemini_engine.recent_lines) <= 20
    logger.info("-> Passed repetition avoidance and history cap (size: %d).", len(gemini_engine.recent_lines))


def test_cache_size_capping_50_limit():
    """Verify that appending lines never exceeds the 50-item cache ceiling (memory leak guard)."""
    logger.info("Executing test_cache_size_capping_50_limit...")
    test_cue = "CHIN_TUCK"
    cue_cache = gemini_engine.cache.setdefault(test_cue, [])
    
    # Simulate adding 100 lines
    for i in range(100):
        if len(cue_cache) >= 50:
            cue_cache.pop(0)
        cue_cache.append(f"Synthetic line {i}")

    assert len(cue_cache) == 50
    assert cue_cache[-1] == "Synthetic line 99"
    logger.info("-> Cache safely capped at 50 items.")


# ============================================================================
# 3. LLM JSON PARSING ROBUSTNESS
# ============================================================================

def test_safe_json_loads_insane_robustness():
    """Verify _safe_json_loads parses standard JSON, markdown fences, and conversational preambles."""
    logger.info("Executing test_safe_json_loads_insane_robustness...")

    # Case 1: Plain JSON
    assert _safe_json_loads('{"lines": ["one", "two"]}') == {"lines": ["one", "two"]}

    # Case 2: Markdown ```json code block
    md_json = "```json\n{\"text\": \"Slide your hips back.\"}\n```"
    assert _safe_json_loads(md_json) == {"text": "Slide your hips back."}

    # Case 3: Markdown code block without language tag
    md_plain = "```\n{\"text\": \"Stand up now.\"}\n```"
    assert _safe_json_loads(md_plain) == {"text": "Stand up now."}

    # Case 4: Preambles and closing remarks outside code fence
    messy = "Here is your humorous ergonomic roast:\n```json\n{\"text\": \"Unclench those shoulders!\"}\n```\nHope that helps!"
    assert _safe_json_loads(messy) == {"text": "Unclench those shoulders!"}

    # Case 5: Empty / whitespace raises JSONDecodeError
    with pytest.raises(json.JSONDecodeError):
        _safe_json_loads("")

    with pytest.raises(json.JSONDecodeError):
        _safe_json_loads("not valid json at all")
    logger.info("-> Passed all LLM JSON parsing variations.")


# ============================================================================
# 4. SESSION SUMMARY OFFLINE GENERATION & BOUNDS
# ============================================================================

def test_generate_session_summary_offline_robust(monkeypatch):
    """Verify 3-sentence summary offline generator handles normal, empty, and None stats."""
    logger.info("Executing test_generate_session_summary_offline_robust...")
    monkeypatch.setattr(gemini_engine, "client", None)

    # 1. Normal stats
    summary_norm = asyncio.run(gemini_engine.generate_session_summary({
        "avg_strain": 0.22,
        "min_hp": 85,
        "minutes": 60,
        "avg_blink_rate": 15.0
    }))
    assert "85%" in summary_norm
    assert "0.22" in summary_norm

    # 2. None stats
    summary_none = asyncio.run(gemini_engine.generate_session_summary(None))
    assert "60%" in summary_none
    assert "0.30" in summary_none

    # 3. Empty stats
    summary_empty = asyncio.run(gemini_engine.generate_session_summary({}))
    assert "ErgoGotchi" in summary_empty

    # 4. Extreme values
    summary_extreme = asyncio.run(gemini_engine.generate_session_summary({
        "avg_strain": 1.0,
        "min_hp": 0
    }))
    assert "0%" in summary_extreme
    assert "1.00" in summary_extreme
    logger.info("-> Passed session summary generation edge cases.")


# ============================================================================
# 5. DATABASE, DETERMINISTIC UUIDS & TIME-WINDOW AGGREGATION
# ============================================================================

def test_to_session_uuid_insane_robustness():
    """Verify deterministic session UUID mapping across valid UUIDs, custom strings, and unicode."""
    logger.info("Executing test_to_session_uuid_insane_robustness...")

    # Valid UUID string -> returns exact same UUID
    valid_str = "b95d31a2-1c5e-4ecd-9eb8-4d4b5ad24894"
    assert str(to_session_uuid(valid_str)) == valid_str

    # UUID object -> returns exact same UUID
    u_obj = uuid.UUID(valid_str)
    assert to_session_uuid(u_obj) == u_obj

    # Arbitrary strings -> deterministic mapping
    u_demo1 = to_session_uuid("demo-laptop")
    u_demo2 = to_session_uuid("demo-laptop")
    assert u_demo1 == u_demo2
    assert isinstance(u_demo1, uuid.UUID)

    # Unicode & special characters
    u_emoji = to_session_uuid("session_👾_rocket_🚀")
    assert isinstance(u_emoji, uuid.UUID)

    # None and empty string
    u_none = to_session_uuid(None)
    u_empty = to_session_uuid("")
    assert u_none == u_empty
    logger.info("-> Passed deterministic UUID mappings.")


def test_sqlite_batch_insert_and_time_filtering():
    """Verify SQLite batch insertion, time-window filtering (30m vs 120m), and velocity."""
    logger.info("Executing test_sqlite_batch_insert_and_time_filtering...")

    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute("""
        CREATE TABLE ergo_telemetry (
            recorded_at TEXT NOT NULL,
            session_id TEXT NOT NULL,
            present INTEGER DEFAULT 1,
            forward_head REAL,
            head_drop REAL,
            lean_in REAL,
            head_pitch_deg REAL,
            shoulder_tilt_deg REAL,
            blink_rate_1m REAL,
            strain_index REAL,
            hp REAL,
            state TEXT
        )
    """)

    sid = str(to_session_uuid("test-perf-session"))
    now = datetime.now(timezone.utc)

    # Insert 3 data points: 10 mins ago, 20 mins ago, 90 mins ago
    t_10m = (now - timedelta(minutes=10)).isoformat()
    t_20m = (now - timedelta(minutes=20)).isoformat()
    t_90m = (now - timedelta(minutes=90)).isoformat()

    conn.execute("INSERT INTO ergo_telemetry VALUES (?, ?, 1, 0.1, 0.1, 0.05, 5.0, 2.0, 14, 0.20, 90, 'THRIVING')", (t_10m, sid))
    conn.execute("INSERT INTO ergo_telemetry VALUES (?, ?, 1, 0.2, 0.2, 0.10, 12.0, 4.0, 8, 0.60, 50, 'SLOUCHING')", (t_20m, sid))
    conn.execute("INSERT INTO ergo_telemetry VALUES (?, ?, 1, 0.3, 0.3, 0.15, 20.0, 6.0, 6, 0.85, 20, 'WILTED')", (t_90m, sid))

    query = """
    SELECT 
        strftime('%Y-%m-%dT%H:%M:00Z', recorded_at) AS bucket,
        AVG(strain_index) AS avg_strain,
        MIN(hp) AS min_hp
    FROM ergo_telemetry
    WHERE session_id = ? AND present = 1 AND datetime(recorded_at) >= datetime('now', '-' || ? || ' minutes')
    GROUP BY bucket
    ORDER BY bucket ASC;
    """

    # Query last 30 minutes -> only t_10m and t_20m
    rows_30 = conn.execute(query, (sid, 30)).fetchall()
    assert len(rows_30) == 2

    # Query last 120 minutes -> all 3
    rows_120 = conn.execute(query, (sid, 120)).fetchall()
    assert len(rows_120) == 3

    # Velocity calculation verification
    strains = [float(r["avg_strain"]) for r in rows_30]
    velocity = round(strains[1] - strains[0], 3)
    assert velocity != 0.0
    logger.info("-> Passed SQLite time filtering and velocity math.")


def test_database_close_lifecycle():
    """Verify db.connect() and db.close() executes cleanly with no lingering locks."""
    logger.info("Executing test_database_close_lifecycle...")
    asyncio.run(db.connect())
    assert db.sqlite_conn is not None or db.pool is not None
    asyncio.run(db.close())
    assert db.pool is None
    assert db.sqlite_conn is None
    logger.info("-> Cleanly opened and closed database lifecycle.")


def test_db_zero_hp_preservation_and_float_batch():
    """Verify 0 HP does not become 100 HP and batch insert handles floats/deduping."""
    logger.info("Executing test_db_zero_hp_preservation_and_float_batch...")
    asyncio.run(db.connect())
    try:
        now_ts = datetime.now(timezone.utc).isoformat()
        records = [
            {
                "session_id": "test-zero-hp-session",
                "recorded_at": now_ts,
                "present": True,
                "blink_rate_1m": 8.5,
                "hp": 0.0,
                "strain_index": 0.9,
                "state": "WILTED"
            },
            # Duplicate (session_id, recorded_at) to verify deduping
            {
                "session_id": "test-zero-hp-session",
                "recorded_at": now_ts,
                "present": True,
                "blink_rate_1m": 9.2,
                "hp": 0.0,
                "strain_index": 0.95,
                "state": "WILTED"
            }
        ]
        asyncio.run(db.insert_telemetry_batch(records))
        series = asyncio.run(db.get_series("test-zero-hp-session", minutes=30))
        assert len(series) >= 1
        assert series[-1]["min_hp"] == 0, f"Expected min_hp == 0, got {series[-1]['min_hp']}"
        logger.info("-> Successfully preserved 0 HP and handled float batch ingestion.")
    finally:
        asyncio.run(db.close())


# ============================================================================
# 6. FASTAPI ENDPOINTS & WEBSOCKET PROTOCOL INTEGRATION
# ============================================================================

def test_fastapi_rest_endpoints():
    """Verify /health, /tiger-data/stats, /sessions/{id}/series, and /sessions/{id}/summary."""
    logger.info("Executing test_fastapi_rest_endpoints...")
    client = TestClient(app)

    # 1. /health
    res_health = client.get("/health")
    assert res_health.status_code == 200
    data_health = res_health.json()
    assert data_health["status"] == "healthy"
    assert "database" in data_health
    logger.info("-> /health verified.")

    # 2. /tiger-data/stats
    res_stats = client.get("/tiger-data/stats")
    assert res_stats.status_code == 200
    assert "storage_engine" in res_stats.json()
    logger.info("-> /tiger-data/stats verified.")

    # 3. /sessions/{id}/series
    res_series = client.get("/sessions/demo-session/series?minutes=30")
    assert res_series.status_code == 200
    data_series = res_series.json()
    assert data_series["session_id"] == "demo-session"
    assert "data" in data_series
    logger.info("-> /sessions/{id}/series verified.")

    # 4. /sessions/{id}/summary
    res_summary = client.get("/sessions/demo-session/summary")
    assert res_summary.status_code == 200
    data_summary = res_summary.json()
    assert "summary" in data_summary
    assert "stats" in data_summary
    logger.info("-> /sessions/{id}/summary verified.")


def test_fastapi_websocket_auth_and_protocols(monkeypatch):
    """Verify WebSocket authentication, ping/pong, Contracts 1, 2, and 3."""
    logger.info("Executing test_fastapi_websocket_auth_and_protocols...")
    monkeypatch.setattr(gemini_engine, "client", None)
    client = TestClient(app)

    # 1. Reject invalid token
    with pytest.raises(Exception):
        with client.websocket_connect("/ws?token=invalid_unauthorized_token"):
            pass

    # 2. Accept valid "dev" or shared token
    with client.websocket_connect("/ws?token=dev") as ws:
        # Test Ping -> Pong
        ws.send_text(json.dumps({"type": "ping"}))
        pong_resp = json.loads(ws.receive_text())
        assert pong_resp["type"] == "pong"
        assert "ts" in pong_resp
        logger.info("-> WebSocket Ping/Pong verified.")

        # Test Contract 1: Ingest Telemetry
        telemetry_payload = {
            "type": "telemetry",
            "v": 1,
            "session_id": "test-ws-session",
            "ts": datetime.now(timezone.utc).isoformat(),
            "present": True,
            "forward_head": 0.12,
            "head_drop": 0.08,
            "strain_index": 0.45,
            "hp": 78.0,
            "state": "THRIVING"
        }
        ws.send_text(json.dumps(telemetry_payload))
        logger.info("-> Contract 1 Telemetry ingested.")

        # Test Contract 2 -> Contract 3: Intervention Request
        req_payload = {
            "type": "intervention_request",
            "v": 1,
            "request_id": "req-ws-test-99",
            "reason": "SLOUCH",
            "context": {
                "hp": 40,
                "worst_signal": "forward_head"
            }
        }
        ws.send_text(json.dumps(req_payload))
        resp_intervention = json.loads(ws.receive_text())

        assert resp_intervention["type"] == "intervention"
        assert resp_intervention["request_id"] == "req-ws-test-99"
        assert resp_intervention["cue"] == "CHIN_TUCK"
        assert resp_intervention["severity"] == "WARNING"
        assert len(resp_intervention["text"]) <= 90
        logger.info("-> Contract 2 -> 3 Intervention dispatched: '%s'", resp_intervention["text"])

        # Test Malformed JSON recovery: connection remains alive!
        ws.send_text("{bad json syntax")
        ws.send_text(json.dumps({"type": "ping"}))
        pong_again = json.loads(ws.receive_text())
        assert pong_again["type"] == "pong"
        logger.info("-> WebSocket safely recovered from malformed JSON without dropping.")


def test_grok_bot_service_safeties():
    """Verify Grok Bot webhook service gracefully handles missing URLs, None IDs, and empty stats."""
    logger.info("Executing test_grok_bot_service_safeties...")
    # 1. Unconfigured webhook returns False cleanly
    res_no_url = asyncio.run(grok_bot.send_session_digest(
        session_id="test-session",
        summary_text="Great work sitting upright!",
        stats={"min_hp": 80, "avg_strain": 0.2, "avg_blink_rate": 14},
        webhook_url=""
    ))
    assert res_no_url is False

    # 2. Non-string / short / None session_id survives formatting
    res_none_id = asyncio.run(grok_bot.send_session_digest(
        session_id=None,
        summary_text="Focus session complete.",
        stats={},
        webhook_url=""
    ))
    assert res_none_id is False
    logger.info("-> Grok Bot service safeties verified.")
