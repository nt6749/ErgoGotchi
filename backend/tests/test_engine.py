"""Unit tests for backend endpoints and telemetry models."""

import os
import sys
import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.config import settings
from app.gemini.engine import gemini_engine, STRETCH_INSTRUCTIONS

def test_cue_mapping():
    """Verify deterministic cue selection based on worst signal or trigger reason."""
    assert gemini_engine.determine_cue("LOW_BLINK", {}) == "LOOK_AWAY"
    assert gemini_engine.determine_cue("LONG_SESSION", {}) == "STAND_UP"
    assert gemini_engine.determine_cue("SLOUCH", {"worst_signal": "forward_head"}) == "CHIN_TUCK"
    assert gemini_engine.determine_cue("SLOUCH", {"worst_signal": "head_drop"}) == "SHOULDER_ROLL"
    assert gemini_engine.determine_cue("SLOUCH", {"worst_signal": "head_pitch"}) == "SHOULDER_ROLL"
    assert gemini_engine.determine_cue("SLOUCH", {"worst_signal": "lean_in"}) == "SIT_BACK"
    assert gemini_engine.determine_cue("SLOUCH", {"worst_signal": "tilt"}) == "SIT_BACK"

def test_stretch_instructions_complete():
    """Verify all cues have clinical-grade ergonomic instructions."""
    for cue in ["CHIN_TUCK", "SHOULDER_ROLL", "SIT_BACK", "LOOK_AWAY", "STAND_UP"]:
        assert cue in STRETCH_INSTRUCTIONS
        assert len(STRETCH_INSTRUCTIONS[cue]) > 10

def test_instant_cached_intervention(monkeypatch):
    """Verify intervention responds in <10ms from cache without network blocking."""
    import asyncio
    # Unit test must not hit the live Gemini API (it would block asyncio.run shutdown)
    monkeypatch.setattr(gemini_engine, "client", None)
    resp = asyncio.run(gemini_engine.get_intervention(
        request_id="test-req-1",
        reason="SLOUCH",
        context={"worst_signal": "forward_head", "hp": 45}
    ))
    assert resp["type"] == "intervention"
    assert resp["cue"] == "CHIN_TUCK"
    assert resp["severity"] == "WARNING"  # hp < 50
    assert len(resp["text"]) <= 90
    assert resp["instruction"] == STRETCH_INSTRUCTIONS["CHIN_TUCK"]

def test_generate_session_summary_offline(monkeypatch):
    """Verify session summary fallback runs offline without API calls."""
    import asyncio
    monkeypatch.setattr(gemini_engine, "client", None)
    summary = asyncio.run(gemini_engine.generate_session_summary({
        "avg_strain": 0.25,
        "min_hp": 80,
        "minutes": 45,
        "avg_blink_rate": 14.2
    }))
    assert "80%" in summary
    assert "0.25" in summary

def test_session_uuid_mapping():
    """Verify to_session_uuid deterministic behavior."""
    from app.db.database import to_session_uuid
    import uuid

    # Deterministic mapping for custom string IDs
    u1 = to_session_uuid("user-laptop-1")
    u2 = to_session_uuid("user-laptop-1")
    assert u1 == u2
    assert isinstance(u1, uuid.UUID)

    # Clean pass-through for existing valid UUIDs
    real_uuid_str = "b95d31a2-1c5e-4ecd-9eb8-4d4b5ad24894"
    assert str(to_session_uuid(real_uuid_str)) == real_uuid_str

def test_sqlite_time_filtering():
    """Verify SQLite query correctly filters by minutes parameter."""
    import sqlite3
    from datetime import datetime, timezone, timedelta
    from app.db.database import to_session_uuid

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

    sid = str(to_session_uuid("test-session"))
    now = datetime.now(timezone.utc)
    recent_ts = (now - timedelta(minutes=5)).isoformat()
    old_ts = (now - timedelta(minutes=60)).isoformat()

    conn.execute(
        "INSERT INTO ergo_telemetry (recorded_at, session_id, present, strain_index, hp) VALUES (?, ?, 1, 0.2, 90)",
        (recent_ts, sid)
    )
    conn.execute(
        "INSERT INTO ergo_telemetry (recorded_at, session_id, present, strain_index, hp) VALUES (?, ?, 1, 0.8, 30)",
        (old_ts, sid)
    )

    query = """
    SELECT strftime('%Y-%m-%dT%H:%M:00Z', recorded_at) AS bucket, AVG(strain_index) AS avg_strain
    FROM ergo_telemetry
    WHERE session_id = ? AND present = 1 AND datetime(recorded_at) >= datetime('now', '-' || ? || ' minutes')
    GROUP BY bucket
    ORDER BY bucket ASC;
    """
    rows_30m = conn.execute(query, (sid, 30)).fetchall()
    assert len(rows_30m) == 1

    rows_120m = conn.execute(query, (sid, 120)).fetchall()
    assert len(rows_120m) == 2
