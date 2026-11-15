"""Database manager supporting both TimescaleDB (Tiger Data) and zero-config SQLite fallback."""

import asyncio
import logging
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

try:
    import asyncpg
    HAS_ASYNCPG = True
except ImportError:
    HAS_ASYNCPG = False

from app.config import settings

logger = logging.getLogger("ergogotchi.db")

_SESSION_NAMESPACE = uuid.UUID("6f1c2a52-3d1e-4b8e-9a51-e0a0f0c0ffee")


def to_session_uuid(session_id) -> uuid.UUID:
    """Map any client session id to a stable UUID (same string -> same UUID)."""
    if isinstance(session_id, uuid.UUID):
        return session_id
    sid = str(session_id or "default-session")
    try:
        return uuid.UUID(sid)
    except ValueError:
        return uuid.uuid5(_SESSION_NAMESPACE, sid)

class DatabaseManager:
    def __init__(self):
        self.pool: Optional[asyncpg.Pool] = None
        self.is_timescaledb: bool = False
        self.sqlite_conn: Optional[sqlite3.Connection] = None
        self._lock = asyncio.Lock()

    async def connect(self):
        """Attempt PostgreSQL/TimescaleDB connection; fall back to local SQLite if unavailable."""
        if HAS_ASYNCPG and settings.DATABASE_URL:
            try:
                self.pool = await asyncpg.create_pool(
                    dsn=settings.DATABASE_URL,
                    min_size=2,
                    max_size=10,
                    timeout=5.0
                )
                async with self.pool.acquire() as conn:
                    # Check if TimescaleDB extension is available
                    ext_check = await conn.fetchval(
                        "SELECT COUNT(*) FROM pg_extension WHERE extname = 'timescaledb';"
                    )
                    self.is_timescaledb = (ext_check > 0)
                    logger.info("Connected to PostgreSQL! TimescaleDB extension active: %s", self.is_timescaledb)
                    await self._init_postgres(conn)
                    return
            except Exception as e:
                logger.warning("Could not connect to PostgreSQL (%s). Falling back to SQLite mode.", e)

        # Fallback SQLite
        self._init_sqlite()

    def _init_sqlite(self):
        """Initialise SQLite database schema."""
        logger.info("Initialising SQLite local store at: %s", settings.SQLITE_DB_PATH)
        self.sqlite_conn = sqlite3.connect(settings.SQLITE_DB_PATH, check_same_thread=False)
        self.sqlite_conn.row_factory = sqlite3.Row
        with self.sqlite_conn:
            self.sqlite_conn.execute("""
                CREATE TABLE IF NOT EXISTS ergo_telemetry (
                    recorded_at TEXT NOT NULL,
                    session_id TEXT NOT NULL,
                    present INTEGER NOT NULL,
                    forward_head REAL,
                    head_drop REAL,
                    lean_in REAL,
                    head_pitch_deg REAL,
                    shoulder_tilt_deg REAL,
                    blink_rate_1m INTEGER,
                    strain_index REAL,
                    hp INTEGER,
                    state TEXT,
                    PRIMARY KEY (session_id, recorded_at)
                );
            """)
            self.sqlite_conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_telemetry_session_time 
                ON ergo_telemetry(session_id, recorded_at);
            """)

    async def _init_postgres(self, conn: asyncpg.Connection):
        """Execute PostgreSQL / TimescaleDB schema."""
        try:
            schema_path = os.path.join(os.path.dirname(__file__), "schema.sql")
            with open(schema_path, "r", encoding="utf-8") as f:
                schema_sql = f.read()
            await conn.execute(schema_sql)
            logger.info("TimescaleDB / Tiger Data schema verified successfully.")
        except Exception as e:
            logger.warning("Error applying full TimescaleDB schema (%s). Running basic table creation.", e)
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS ergo_telemetry (
                    recorded_at TIMESTAMPTZ NOT NULL,
                    session_id UUID NOT NULL,
                    present BOOLEAN NOT NULL,
                    forward_head REAL,
                    head_drop REAL,
                    lean_in REAL,
                    head_pitch_deg REAL,
                    shoulder_tilt_deg REAL,
                    blink_rate_1m SMALLINT,
                    strain_index REAL,
                    hp SMALLINT,
                    state TEXT,
                    PRIMARY KEY (session_id, recorded_at)
                );
            """)

    async def insert_telemetry_batch(self, records: List[Dict[str, Any]]):
        """Batch insert telemetry records."""
        if not records:
            return

        if self.pool:
            try:
                # asyncpg copy_records_to_table format
                tuples = []
                for r in records:
                    ts = r.get("recorded_at")
                    if isinstance(ts, str):
                        try:
                            ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                        except Exception:
                            ts = datetime.now(timezone.utc)
                    elif not ts:
                        ts = datetime.now(timezone.utc)

                    sid = to_session_uuid(r.get("session_id"))

                    tuples.append((
                        ts,
                        sid,
                        bool(r.get("present", True)),
                        r.get("forward_head"),
                        r.get("head_drop"),
                        r.get("lean_in"),
                        r.get("head_pitch_deg"),
                        r.get("shoulder_tilt_deg"),
                        r.get("blink_rate_1m"),
                        r.get("strain_index"),
                        r.get("hp"),
                        r.get("state")
                    ))

                async with self.pool.acquire() as conn:
                    await conn.copy_records_to_table(
                        "ergo_telemetry",
                        records=tuples,
                        columns=[
                            "recorded_at", "session_id", "present", "forward_head",
                            "head_drop", "lean_in", "head_pitch_deg", "shoulder_tilt_deg",
                            "blink_rate_1m", "strain_index", "hp", "state"
                        ]
                    )
                return
            except Exception as e:
                logger.error("Error batch inserting to PostgreSQL: %s. Falling back to SQLite insertion.", e)

        # SQLite insertion fallback
        if not self.sqlite_conn:
            self._init_sqlite()

        if self.sqlite_conn:
            async with self._lock:
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(None, self._insert_sqlite_sync, records)

    def _insert_sqlite_sync(self, records: List[Dict[str, Any]]):
        rows = []
        for r in records:
            ts = r.get("recorded_at")
            if isinstance(ts, datetime):
                ts = ts.isoformat()
            elif not ts:
                ts = datetime.now(timezone.utc).isoformat()

            sid = str(to_session_uuid(r.get("session_id")))
            rows.append((
                ts,
                sid,
                1 if r.get("present", True) else 0,
                r.get("forward_head"),
                r.get("head_drop"),
                r.get("lean_in"),
                r.get("head_pitch_deg"),
                r.get("shoulder_tilt_deg"),
                r.get("blink_rate_1m"),
                r.get("strain_index"),
                r.get("hp"),
                r.get("state")
            ))

        try:
            with self.sqlite_conn:
                self.sqlite_conn.executemany("""
                    INSERT OR REPLACE INTO ergo_telemetry 
                    (recorded_at, session_id, present, forward_head, head_drop, lean_in, 
                     head_pitch_deg, shoulder_tilt_deg, blink_rate_1m, strain_index, hp, state)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, rows)
        except Exception as e:
            logger.error("SQLite batch insert failed: %s", e)

    async def get_series(self, session_id: str, minutes: int = 30) -> List[Dict[str, Any]]:
        """Retrieve 1-minute bucketed continuous aggregate series with strain velocity."""
        if self.pool and self.is_timescaledb:
            try:
                sid = to_session_uuid(session_id)
                query = """
                SELECT 
                    bucket,
                    ROUND(avg_strain::numeric, 3) as avg_strain,
                    ROUND(peak_strain::numeric, 3) as peak_strain,
                    ROUND((avg_strain - LAG(avg_strain) OVER (ORDER BY bucket))::numeric, 3) AS strain_velocity,
                    ROUND(avg_forward_head::numeric, 3) as avg_forward_head,
                    ROUND(avg_head_drop::numeric, 3) as avg_head_drop,
                    ROUND(avg_blink_rate::numeric, 1) as avg_blink_rate,
                    min_hp
                FROM ergo_1min
                WHERE session_id = $1 AND bucket > now() - ($2 || ' minutes')::interval
                ORDER BY bucket ASC;
                """
                async with self.pool.acquire() as conn:
                    rows = await conn.fetch(query, sid, str(minutes))
                    return [
                        {
                            "bucket": r["bucket"].isoformat(),
                            "avg_strain": float(r["avg_strain"] or 0),
                            "peak_strain": float(r["peak_strain"] or 0),
                            "strain_velocity": float(r["strain_velocity"] or 0),
                            "avg_forward_head": float(r["avg_forward_head"] or 0),
                            "avg_head_drop": float(r["avg_head_drop"] or 0),
                            "avg_blink_rate": float(r["avg_blink_rate"] or 0),
                            "min_hp": int(r["min_hp"] or 100),
                        }
                        for r in rows
                    ]
            except Exception as e:
                logger.warning("TimescaleDB query failed (%s); querying raw SQLite fallback.", e)

        # Fallback SQLite 1-minute aggregation
        if not self.sqlite_conn:
            self._init_sqlite()

        if self.sqlite_conn:
            async with self._lock:
                loop = asyncio.get_event_loop()
                return await loop.run_in_executor(None, self._query_sqlite_series, session_id, minutes)

        return []

    def _query_sqlite_series(self, session_id: str, minutes: int) -> List[Dict[str, Any]]:
        sid = str(to_session_uuid(session_id))
        query = """
        SELECT 
            strftime('%Y-%m-%dT%H:%M:00Z', recorded_at) AS bucket,
            AVG(strain_index) AS avg_strain,
            MAX(strain_index) AS peak_strain,
            AVG(forward_head) AS avg_forward_head,
            AVG(head_drop) AS avg_head_drop,
            AVG(blink_rate_1m) AS avg_blink_rate,
            MIN(hp) AS min_hp
        FROM ergo_telemetry
        WHERE session_id = ? AND present = 1 AND datetime(recorded_at) >= datetime('now', '-' || ? || ' minutes')
        GROUP BY bucket
        ORDER BY bucket ASC;
        """
        cursor = self.sqlite_conn.cursor()
        cursor.execute(query, (sid, int(minutes)))
        rows = cursor.fetchall()
        
        results = []
        prev_strain = None
        for r in rows:
            strain = float(r["avg_strain"] or 0)
            velocity = round(strain - prev_strain, 3) if prev_strain is not None else 0.0
            prev_strain = strain
            results.append({
                "bucket": r["bucket"],
                "avg_strain": round(strain, 3),
                "peak_strain": round(float(r["peak_strain"] or 0), 3),
                "strain_velocity": velocity,
                "avg_forward_head": round(float(r["avg_forward_head"] or 0), 3),
                "avg_head_drop": round(float(r["avg_head_drop"] or 0), 3),
                "avg_blink_rate": round(float(r["avg_blink_rate"] or 0), 1),
                "min_hp": int(r["min_hp"] or 100),
            })
        return results

    async def get_stats(self) -> Dict[str, Any]:
        """Return Tiger Data hypertable stats & row counts."""
        if self.pool and self.is_timescaledb:
            try:
                async with self.pool.acquire() as conn:
                    row_count = await conn.fetchval("SELECT COUNT(*) FROM ergo_telemetry;")
                    agg_count = await conn.fetchval("SELECT COUNT(*) FROM ergo_1min;")
                    chunk_count = await conn.fetchval(
                        "SELECT COUNT(*) FROM timescaledb_information.chunks WHERE hypertable_name = 'ergo_telemetry';"
                    )
                    return {
                        "storage_engine": "TimescaleDB (Tiger Data)",
                        "telemetry_rows": row_count,
                        "aggregate_rows": agg_count,
                        "active_chunks": chunk_count,
                        "compression_enabled": True,
                        "status": "HEALTHY"
                    }
            except Exception as e:
                logger.error("Failed to query TimescaleDB stats: %s", e)

        # SQLite fallback stats
        if not self.sqlite_conn:
            self._init_sqlite()

        if self.sqlite_conn:
            cursor = self.sqlite_conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM ergo_telemetry;")
            row_count = cursor.fetchone()[0]
            return {
                "storage_engine": "SQLite Emulation Mode",
                "telemetry_rows": row_count,
                "aggregate_rows": 0,
                "active_chunks": 1,
                "compression_enabled": False,
                "status": "LOCAL_FALLBACK"
            }

        return {"storage_engine": "None", "status": "DISCONNECTED"}

    async def close(self):
        """Cleanly close database connection pools and SQLite handle."""
        if self.pool:
            try:
                await self.pool.close()
                logger.info("Closed TimescaleDB/PostgreSQL connection pool.")
            except Exception as e:
                logger.warning("Error closing PostgreSQL pool: %s", e)
            self.pool = None

        if self.sqlite_conn:
            try:
                self.sqlite_conn.close()
                logger.info("Closed SQLite connection.")
            except Exception as e:
                logger.warning("Error closing SQLite connection: %s", e)
            self.sqlite_conn = None

db = DatabaseManager()
