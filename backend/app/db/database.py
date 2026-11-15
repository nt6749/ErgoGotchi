"""Database manager supporting both TimescaleDB (Tiger Data) and zero-config SQLite fallback."""

import asyncio
import logging
import math
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

VALID_STATES = frozenset({"CALIBRATING", "THRIVING", "NEUTRAL", "SLOUCHING", "WILTED", "AWAY"})


def _clean_float(val: Any) -> Optional[float]:
    if val is None:
        return None
    try:
        f = float(val)
        return f if math.isfinite(f) else None
    except (ValueError, TypeError):
        return None


def _clean_state(val: Any) -> str:
    s = str(val or "NEUTRAL").upper().strip()
    return s if s in VALID_STATES else "NEUTRAL"


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
        self._stats_cache: Optional[Dict[str, Any]] = None
        self._stats_ts: float = 0.0

    async def connect(self):
        """Attempt PostgreSQL/TimescaleDB connection; fall back to local SQLite if unavailable."""
        if self.pool or self.sqlite_conn:
            await self.close()

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
        """Initialise SQLite database schema with OneDrive-safe WAL tuning."""
        logger.info("Initialising SQLite local store at: %s", settings.SQLITE_DB_PATH)
        self.sqlite_conn = sqlite3.connect(settings.SQLITE_DB_PATH, check_same_thread=False, timeout=5.0)
        self.sqlite_conn.row_factory = sqlite3.Row
        with self.sqlite_conn:
            self.sqlite_conn.execute("PRAGMA busy_timeout = 5000;")
            self.sqlite_conn.execute("PRAGMA journal_mode = WAL;")
            self.sqlite_conn.execute("PRAGMA synchronous = NORMAL;")
            self.sqlite_conn.execute("PRAGMA temp_store = MEMORY;")
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
        """Execute PostgreSQL / TimescaleDB schema statement-by-statement."""
        try:
            schema_path = os.path.join(os.path.dirname(__file__), "schema.sql")
            with open(schema_path, "r", encoding="utf-8") as f:
                schema_sql = f.read()
            for stmt in [s.strip() for s in schema_sql.split(";") if s.strip()]:
                try:
                    await conn.execute(stmt + ";")
                except Exception as stmt_err:
                    logger.debug("Schema statement skipped/note: %s", stmt_err)
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
                deduped = {}
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
                    raw_blink = r.get("blink_rate_1m")
                    raw_hp = r.get("hp")

                    deduped[(sid, ts)] = (
                        ts,
                        sid,
                        bool(r.get("present", True)),
                        _clean_float(r.get("forward_head")),
                        _clean_float(r.get("head_drop")),
                        _clean_float(r.get("lean_in")),
                        _clean_float(r.get("head_pitch_deg")),
                        _clean_float(r.get("shoulder_tilt_deg")),
                        int(round(float(raw_blink))) if raw_blink is not None else None,
                        _clean_float(r.get("strain_index")),
                        int(round(float(raw_hp))) if raw_hp is not None else 100,
                        _clean_state(r.get("state"))
                    )
                tuples = list(deduped.values())

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
                loop = asyncio.get_running_loop()
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
            raw_blink = r.get("blink_rate_1m")
            raw_hp = r.get("hp")
            rows.append((
                ts,
                sid,
                1 if r.get("present", True) else 0,
                _clean_float(r.get("forward_head")),
                _clean_float(r.get("head_drop")),
                _clean_float(r.get("lean_in")),
                _clean_float(r.get("head_pitch_deg")),
                _clean_float(r.get("shoulder_tilt_deg")),
                int(round(float(raw_blink))) if raw_blink is not None else None,
                _clean_float(r.get("strain_index")),
                int(round(float(raw_hp))) if raw_hp is not None else 100,
                _clean_state(r.get("state"))
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
                WHERE session_id = $1 AND bucket > now() - make_interval(mins => $2)
                ORDER BY bucket ASC;
                """
                async with self.pool.acquire() as conn:
                    rows = await conn.fetch(query, sid, int(minutes))
                    return [
                        {
                            "bucket": r["bucket"].isoformat(),
                            "avg_strain": float(r["avg_strain"] or 0),
                            "peak_strain": float(r["peak_strain"] or 0),
                            "strain_velocity": float(r["strain_velocity"] or 0),
                            "avg_forward_head": float(r["avg_forward_head"] or 0),
                            "avg_head_drop": float(r["avg_head_drop"] or 0),
                            "avg_blink_rate": float(r["avg_blink_rate"] or 0),
                            "min_hp": 100 if r["min_hp"] is None else int(r["min_hp"]),
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
                loop = asyncio.get_running_loop()
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
                "min_hp": 100 if r["min_hp"] is None else int(r["min_hp"]),
            })
        return results

    def _count_sqlite_rows(self) -> int:
        if not self.sqlite_conn:
            return 0
        cursor = self.sqlite_conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM ergo_telemetry;")
        res = cursor.fetchone()
        return int(res[0]) if res else 0

    async def get_stats(self) -> Dict[str, Any]:
        """Return Tiger Data hypertable stats & row counts with 2-second TTL cache and single round-trip."""
        now = asyncio.get_running_loop().time()
        if self._stats_cache and (now - self._stats_ts) < 2.0:
            return self._stats_cache

        if self.pool and self.is_timescaledb:
            try:
                async with self.pool.acquire() as conn:
                    # Triple fallback:
                    # 1. approximate_row_count('ergo_telemetry')
                    # 2. SUM(s.n_live_tup) across chunks from pg_stat_user_tables
                    # 3. SELECT COUNT(*) FROM ergo_telemetry
                    row = await conn.fetchrow("""
                        SELECT
                            COALESCE(
                                NULLIF(approximate_row_count('ergo_telemetry'), 0),
                                NULLIF((
                                    SELECT SUM(s.n_live_tup)::bigint
                                    FROM pg_stat_user_tables s
                                    JOIN timescaledb_information.chunks c
                                      ON s.schemaname = c.chunk_schema AND s.relname = c.chunk_name
                                    WHERE c.hypertable_name = 'ergo_telemetry'
                                ), 0),
                                (SELECT COUNT(*) FROM ergo_telemetry)
                            ) AS telemetry_rows,
                            (SELECT COUNT(*) FROM ergo_1min) AS aggregate_rows,
                            (SELECT COUNT(*) FROM timescaledb_information.chunks
                             WHERE hypertable_name = 'ergo_telemetry') AS active_chunks;
                    """)
                    self._stats_cache = {
                        "storage_engine": "TimescaleDB (Tiger Data)",
                        "telemetry_rows": int(row["telemetry_rows"] or 0),
                        "aggregate_rows": int(row["aggregate_rows"] or 0),
                        "active_chunks": int(row["active_chunks"] or 0),
                        "compression_enabled": True,
                        "status": "HEALTHY"
                    }
                    self._stats_ts = now
                    return self._stats_cache
            except Exception as e:
                logger.error("Failed to query TimescaleDB stats: %s", e)

        # SQLite fallback stats
        if not self.sqlite_conn:
            self._init_sqlite()

        if self.sqlite_conn:
            async with self._lock:
                loop = asyncio.get_running_loop()
                row_count = await loop.run_in_executor(None, self._count_sqlite_rows)
            self._stats_cache = {
                "storage_engine": "SQLite Emulation Mode",
                "telemetry_rows": row_count,
                "aggregate_rows": 0,
                "active_chunks": 1,
                "compression_enabled": False,
                "status": "LOCAL_FALLBACK"
            }
            self._stats_ts = now
            return self._stats_cache

        return {"storage_engine": "None", "status": "DISCONNECTED"}

    async def close(self):
        """Cleanly close database connection pools and SQLite handle."""
        self._stats_cache = None
        self._stats_ts = 0.0

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
