"""Tiger Data Scalability Simulator: Streams 300 concurrent synthetic users at 1 Hz."""

import asyncio
import os
import random
import sys
import time
import uuid
from datetime import datetime, timezone

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.db.database import db

TOTAL_SESSIONS = 300
BATCH_INTERVAL = 1.0  # 1 Hz

async def run_simulator():
    print(f"Initialising Tiger Data load simulator for {TOTAL_SESSIONS} concurrent sessions...")
    await db.connect()
    
    session_ids = [str(uuid.uuid4()) for _ in range(TOTAL_SESSIONS)]
    hps = [random.randint(60, 100) for _ in range(TOTAL_SESSIONS)]
    
    print(f"Streaming {TOTAL_SESSIONS} rows/sec (~1,080,000 rows/hour) into Tiger Data / TimescaleDB...")
    print("Press Ctrl+C to stop.\n")
    
    total_inserted = 0
    start_time = time.time()
    
    try:
        while True:
            step_start = time.time()
            now_iso = datetime.now(timezone.utc).isoformat()
            batch = []
            
            for i, sid in enumerate(session_ids):
                # Small random variation
                strain = max(0.0, min(1.0, random.gauss(0.3, 0.15)))
                if strain > 0.5:
                    hps[i] = max(10, hps[i] - 1)
                    state = "SLOUCHING"
                else:
                    hps[i] = min(100, hps[i] + 1)
                    state = "THRIVING" if hps[i] >= 80 else "NEUTRAL"
                
                batch.append({
                    "recorded_at": now_iso,
                    "session_id": sid,
                    "present": True,
                    "forward_head": round(random.uniform(0.02, 0.16), 3),
                    "head_drop": round(random.uniform(0.01, 0.14), 3),
                    "lean_in": round(random.uniform(0.0, 0.1), 3),
                    "head_pitch_deg": round(random.uniform(2.0, 25.0), 1),
                    "shoulder_tilt_deg": round(random.uniform(1.0, 8.0), 1),
                    "blink_rate_1m": random.randint(5, 20),
                    "strain_index": round(strain, 3),
                    "hp": hps[i],
                    "state": state
                })
            
            await db.insert_telemetry_batch(batch)
            total_inserted += len(batch)
            elapsed = time.time() - start_time
            rate = total_inserted / elapsed if elapsed > 0 else 0
            
            print(f"\r[Tiger Data Load] Total rows: {total_inserted:,} | Ingestion Rate: {rate:.1f} rows/s | Active Sessions: {TOTAL_SESSIONS}", end="")
            
            sleep_time = max(0.0, BATCH_INTERVAL - (time.time() - step_start))
            await asyncio.sleep(sleep_time)
            
    except KeyboardInterrupt:
        print("\nSimulator stopped by user.")
        stats = await db.get_stats()
        print("Database stats:", stats)

if __name__ == "__main__":
    asyncio.run(run_simulator())
