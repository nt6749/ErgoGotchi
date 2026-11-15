"""ErgoGotchi End-to-End Performance & Latency Benchmark Suite.

Tests and quantifies the operational speed of the backend in totality:
1. Telemetry Ingestion Throughput & Batch Insert Latency (Tiger Data / SQLite)
2. Database Metadata / Hypertable Stats Query Speed (Uncached vs 2s TTL Cache)
3. 1-Minute Continuous Aggregate Time-Series Fetch (idx_ergo_1min_session_bucket)
4. WebSocket Bi-directional Round-Trip & Sub-Millisecond Intervention Dispatch
5. Session Summary & Gemini Ergonomic Coaching (Cold vs 30s Adaptive Cache)
"""

import asyncio
import json
import os
import random
import statistics
import sys
import time
import uuid
from datetime import datetime, timezone

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from starlette.testclient import TestClient
from app.main import app
from app.db.database import db
from app.gemini.engine import gemini_engine
from app.config import settings

def percentile(data: list[float], p: float) -> float:
    """Calculate percentile from a sorted list of float values."""
    if not data:
        return 0.0
    k = (len(data) - 1) * (p / 100.0)
    f = int(k)
    c = f + 1
    if c < len(data):
        return data[f] + (k - f) * (data[c] - data[f])
    return data[f]

def format_latency(ms: float) -> str:
    """Pretty format millisecond latency."""
    if ms < 0.001:
        return f"{ms * 1_000_000:.1f} ns"
    elif ms < 1.0:
        return f"{ms * 1_000:.2f} µs"
    elif ms < 1000.0:
        return f"{ms:.2f} ms"
    else:
        return f"{ms / 1000.0:.2f} s"

class BenchmarkReport:
    def __init__(self):
        self.results = []

    def add_metric(self, name: str, latencies_ms: list[float], throughput_label: str = "", note: str = ""):
        sorted_lat = sorted(latencies_ms)
        count = len(sorted_lat)
        avg = statistics.mean(sorted_lat) if count else 0.0
        p50 = percentile(sorted_lat, 50)
        p95 = percentile(sorted_lat, 95)
        p99 = percentile(sorted_lat, 99)
        max_lat = sorted_lat[-1] if count else 0.0

        self.results.append({
            "name": name,
            "count": count,
            "avg": avg,
            "p50": p50,
            "p95": p95,
            "p99": p99,
            "max": max_lat,
            "throughput": throughput_label,
            "note": note
        })

    def print_summary(self, storage_engine: str):
        print("\n" + "=" * 110)
        print(f"  ERGOGOTCHI SYSTEM-WIDE PERFORMANCE BENCHMARK REPORT")
        print(f"  Storage Engine : {storage_engine}")
        print(f"  Gemini Model   : {settings.GEMINI_MODEL} (API Key: {'Configured' if settings.GEMINI_API_KEY else 'Hermetic Mock'})")
        print(f"  Timestamp      : {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}")
        print("=" * 110)
        header = f"{'Operation / Benchmark Target':<38} | {'Iters':>5} | {'Avg':>9} | {'P50':>9} | {'P95':>9} | {'P99':>9} | {'Max':>9} | {'Throughput / SLA':<15}"
        print(header)
        print("-" * 110)

        for r in self.results:
            avg_str = format_latency(r["avg"])
            p50_str = format_latency(r["p50"])
            p95_str = format_latency(r["p95"])
            p99_str = format_latency(r["p99"])
            max_str = format_latency(r["max"])
            tp_str = r["throughput"] or r["note"]

            print(f"{r['name']:<38} | {r['count']:>5} | {avg_str:>9} | {p50_str:>9} | {p95_str:>9} | {p99_str:>9} | {max_str:>9} | {tp_str:<15}")

        print("=" * 110 + "\n")


async def run_benchmark():
    print("==========================================================================")
    print("  Starting ErgoGotchi Total Operations Speed & Latency Benchmark")
    print("==========================================================================")
    report = BenchmarkReport()

    # 1. Connect database
    print("\n[1/5] Initialising database connection...")
    await db.connect()
    initial_stats = await db.get_stats()
    storage_engine = initial_stats.get("storage_engine", "Unknown")
    print(f"-> Active Storage: {storage_engine}")

    bench_session = str(uuid.uuid4())

    # 2. Database Batch Ingestion Throughput Benchmark
    print("\n[2/5] Benchmarking Telemetry Ingestion Throughput (Batch writes)...")
    batch_sizes = [50, 100, 300]
    for size in batch_sizes:
        durations = []
        iterations = 10
        for _ in range(iterations):
            now_dt = datetime.now(timezone.utc)
            records = [{
                "recorded_at": now_dt,
                "session_id": bench_session,
                "present": True,
                "forward_head": round(random.uniform(0.02, 0.15), 3),
                "head_drop": round(random.uniform(0.01, 0.12), 3),
                "lean_in": 0.02,
                "head_pitch_deg": 12.0,
                "shoulder_tilt_deg": 3.0,
                "blink_rate_1m": 15,
                "strain_index": 0.35,
                "hp": 85,
                "state": "THRIVING"
            } for _ in range(size)]

            t0 = time.perf_counter()
            await db.insert_telemetry_batch(records)
            t1 = time.perf_counter()
            durations.append((t1 - t0) * 1000.0)

        avg_sec = statistics.mean(durations) / 1000.0
        rows_per_sec = (size / avg_sec) if avg_sec > 0 else 0
        report.add_metric(
            f"DB Ingest Batch ({size} rows/batch)",
            durations,
            throughput_label=f"{rows_per_sec:,.0f} rows/s"
        )

    # 3. Database Stats & Continuous Aggregate Window Scans
    print("\n[3/5] Benchmarking Time-Series Continuous Aggregate & Metadata Queries...")
    # Uncached get_stats() round-trip
    stats_uncached_durations = []
    # Force expire cache to measure raw query time
    db._stats_cache = None
    t0 = time.perf_counter()
    await db.get_stats()
    stats_uncached_durations.append((time.perf_counter() - t0) * 1000.0)
    report.add_metric("DB Stats (Uncached metadata)", stats_uncached_durations, note="Cold round-trip")

    # Cached get_stats() (2-second TTL)
    stats_cached_durations = []
    for _ in range(100):
        t0 = time.perf_counter()
        await db.get_stats()
        stats_cached_durations.append((time.perf_counter() - t0) * 1000.0)
    report.add_metric("DB Stats (2s TTL Cache Hit)", stats_cached_durations, note="O(1) memory")

    # get_series query (indexed scan)
    series_durations = []
    for _ in range(30):
        t0 = time.perf_counter()
        await db.get_series(bench_session, minutes=60)
        series_durations.append((time.perf_counter() - t0) * 1000.0)
    report.add_metric("Time-Series Scan (get_series)", series_durations, note="Indexed window")

    # 4. In-Memory Engine & Intervention Dispatch Benchmark
    print("\n[4/5] Benchmarking Sub-Millisecond Intervention Dispatch...")
    dispatch_durations = []
    for i in range(100):
        req_id = f"bench-req-{i}"
        t0 = time.perf_counter()
        await gemini_engine.get_intervention(
            request_id=req_id,
            reason="SLOUCH",
            context={"hp": 35, "worst_signal": "forward_head"}
        )
        dispatch_durations.append((time.perf_counter() - t0) * 1000.0)
    report.add_metric("Intervention Engine Dispatch", dispatch_durations, note="Target < 2ms")

    # 5. Full End-to-End WebSocket Round-Trip & REST APIs via TestClient
    print("\n[5/5] Benchmarking Full WebSocket & REST Pipeline End-to-End...")
    with TestClient(app) as client:
        # WebSocket Ping-Pong
        with client.websocket_connect("/ws?token=dev") as ws:
            ws_ping_durations = []
            for _ in range(50):
                t0 = time.perf_counter()
                ws.send_text(json.dumps({"type": "ping"}))
                msg = ws.receive_text()
                ws_ping_durations.append((time.perf_counter() - t0) * 1000.0)
            report.add_metric("WebSocket Ping-Pong RTT", ws_ping_durations, note="Transport RTT")

            # WebSocket Contract 1 Telemetry Ingestion (1 Hz push)
            ws_telemetry_durations = []
            for i in range(50):
                payload = {
                    "type": "telemetry",
                    "session_id": bench_session,
                    "ts": datetime.now(timezone.utc).isoformat(),
                    "present": True,
                    "forward_head": 0.10,
                    "strain_index": 0.3,
                    "hp": 90
                }
                t0 = time.perf_counter()
                ws.send_text(json.dumps(payload))
                ws_telemetry_durations.append((time.perf_counter() - t0) * 1000.0)
            report.add_metric("WebSocket Telemetry Ingest", ws_telemetry_durations, note="Push to deque")

            # WebSocket Contract 2 -> 3 Round-Trip (Intervention Request -> Intervention Delivery)
            ws_intervention_rtt = []
            for i in range(50):
                req = {
                    "type": "intervention_request",
                    "request_id": f"ws-bench-{i}",
                    "reason": "SLOUCH",
                    "context": {"hp": 45, "worst_signal": "shoulder_tilt"}
                }
                t0 = time.perf_counter()
                ws.send_text(json.dumps(req))
                res = json.loads(ws.receive_text())
                ws_intervention_rtt.append((time.perf_counter() - t0) * 1000.0)
            report.add_metric("WebSocket Intervention E2E RTT", ws_intervention_rtt, note="Full duplex RTT")

        # REST /health
        health_durations = []
        for _ in range(50):
            t0 = time.perf_counter()
            r = client.get("/health")
            health_durations.append((time.perf_counter() - t0) * 1000.0)
        report.add_metric("REST GET /health", health_durations, note="Health check")

        # REST /sessions/{id}/summary (Adaptive 30s cache test)
        # First call: uncached (generates summary)
        summary_uncached_durations = []
        t0 = time.perf_counter()
        r1 = client.get(f"/sessions/{bench_session}/summary")
        summary_uncached_durations.append((time.perf_counter() - t0) * 1000.0)
        report.add_metric("REST GET /summary (Uncached)", summary_uncached_durations, note="Fresh generate")

        # Subsequent calls: hit adaptive cache
        summary_cached_durations = []
        for _ in range(50):
            t0 = time.perf_counter()
            r = client.get(f"/sessions/{bench_session}/summary")
            summary_cached_durations.append((time.perf_counter() - t0) * 1000.0)
        report.add_metric("REST GET /summary (30s Cache Hit)", summary_cached_durations, note="Zero-latency hit")

    await db.close()

    # Print formatted summary table
    report.print_summary(storage_engine)


if __name__ == "__main__":
    asyncio.run(run_benchmark())
