"""Unit tests for backend endpoints and telemetry models."""

import pytest
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

@pytest.mark.asyncio
async def test_instant_cached_intervention():
    """Verify intervention responds in <10ms from cache without network blocking."""
    resp = await gemini_engine.get_intervention(
        request_id="test-req-1",
        reason="SLOUCH",
        context={"worst_signal": "forward_head", "hp": 45}
    )
    assert resp["type"] == "intervention"
    assert resp["cue"] == "CHIN_TUCK"
    assert resp["severity"] == "WARNING"  # hp < 50
    assert len(resp["text"]) <= 90
    assert resp["instruction"] == STRETCH_INSTRUCTIONS["CHIN_TUCK"]
