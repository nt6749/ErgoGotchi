"""Seed realistic posture history for judging demos and Tiger Data verification."""

import asyncio
import os
import random
import sys
import uuid
from datetime import datetime, timezone, timedelta

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.db.database import db
from app.config import settings

async def seed_data():
    print("Connecting to database...")
    await db.connect()
    try:
        session_id = str(uuid.uuid4())
        print(f"Generating realistic ergonomic session history for Session ID: {session_id}")
    
    records = []
    now = datetime.now(timezone.utc)
    
    # Generate 120 minutes of second-by-second telemetry
    current_hp = 95
    base_strain = 0.15
    
    for i in range(120 * 60):
        t = now - timedelta(seconds=(120 * 60 - i))
        
        # Simulate work patterns: upright focus -> gradual slouch -> break recovery
        minute = i // 60
        if 20 <= minute <= 40 or 70 <= minute <= 85:
            # Slouching / deep fatigue window
            strain = min(1.0, max(0.4, random.gauss(0.65, 0.12)))
            f_head = random.gauss(0.14, 0.03)
            h_drop = random.gauss(0.12, 0.02)
            pitch = random.gauss(18.0, 4.0)
            tilt = random.gauss(6.0, 2.0)
            blinks = random.randint(4, 9)
            current_hp = max(10, current_hp - 0.08)
            state = "SLOUCHING" if current_hp >= 20 else "WILTED"
        elif 41 <= minute <= 46:
            # Active stretch & ergonomic reset
            strain = 0.05
            f_head = 0.01
            h_drop = 0.02
            pitch = 1.0
            tilt = 1.0
            blinks = 16
            current_hp = min(100, current_hp + 0.3)
            state = "THRIVING"
        else:
            # Normal healthy programming posture
            strain = min(0.35, max(0.05, random.gauss(0.2, 0.06)))
            f_head = random.gauss(0.04, 0.02)
            h_drop = random.gauss(0.03, 0.01)
            pitch = random.gauss(4.0, 2.0)
            tilt = random.gauss(2.0, 1.0)
            blinks = random.randint(12, 20)
            current_hp = min(100, current_hp + 0.04)
            state = "THRIVING" if current_hp >= 80 else "NEUTRAL"

        records.append({
            "recorded_at": t.isoformat(),
            "session_id": session_id,
            "present": True,
            "forward_head": round(f_head, 3),
            "head_drop": round(h_drop, 3),
            "lean_in": round(random.uniform(0.0, 0.08), 3),
            "head_pitch_deg": round(pitch, 1),
            "shoulder_tilt_deg": round(tilt, 1),
            "blink_rate_1m": blinks,
            "strain_index": round(strain, 3),
            "hp": int(current_hp),
            "state": state
        })
        
        # Flush in chunks of 1000
        if len(records) >= 1000:
            await db.insert_telemetry_batch(records)
            records.clear()
            print(f"Inserted {i} / 7200 records...")

    if records:
        await db.insert_telemetry_batch(records)

    print("Successfully seeded 7,200 telemetry points.")

    # Refresh continuous aggregate if on TimescaleDB
    if db.pool and db.is_timescaledb:
        try:
            print("Triggering TimescaleDB continuous aggregate manual refresh...")
            async with db.pool.acquire() as conn:
                await conn.execute("""
                    CALL refresh_continuous_aggregate('ergo_1min', now() - INTERVAL '7 days', now() - INTERVAL '1 minute');
                """)
            print("Continuous aggregate 'ergo_1min' successfully refreshed!")
        except Exception as e:
            print(f"Note on refresh aggregate: {e}")

    print(f"\n[DONE] To view seeded dashboard series in API:\nGET http://localhost:8000/sessions/{session_id}/series?minutes=120\n")
    finally:
        await db.close()

if __name__ == "__main__":
    asyncio.run(seed_data())
