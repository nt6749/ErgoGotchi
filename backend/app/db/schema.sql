-- ErgoGotchi / Tiger Data (TimescaleDB) Schema
-- High-frequency telemetry hypertable & continuous aggregates

CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS ergo_telemetry (
  recorded_at        TIMESTAMPTZ NOT NULL,
  session_id         UUID        NOT NULL,
  present            BOOLEAN     NOT NULL,
  forward_head       REAL,
  head_drop          REAL,
  lean_in            REAL,
  head_pitch_deg     REAL,
  shoulder_tilt_deg  REAL,
  blink_rate_1m      SMALLINT,
  strain_index       REAL,
  hp                 SMALLINT,
  state              TEXT,
  PRIMARY KEY (session_id, recorded_at)
);

-- Partition into 1-hour hypertable chunks for fast time-range querying
SELECT create_hypertable(
  'ergo_telemetry',
  by_range('recorded_at', INTERVAL '1 hour'),
  if_not_exists => TRUE
);

-- Materialized Continuous Aggregate: 1-minute rolling summaries
CREATE MATERIALIZED VIEW IF NOT EXISTS ergo_1min
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT
  time_bucket('1 minute', recorded_at) AS bucket,
  session_id,
  avg(strain_index)   AS avg_strain,
  max(strain_index)   AS peak_strain,
  avg(forward_head)   AS avg_forward_head,
  avg(head_drop)      AS avg_head_drop,
  avg(blink_rate_1m)  AS avg_blink_rate,
  min(hp)             AS min_hp
FROM ergo_telemetry
WHERE present
GROUP BY bucket, session_id
WITH NO DATA;

-- Continuous Aggregate Policy: refreshes recent windows every minute
SELECT add_continuous_aggregate_policy('ergo_1min',
  start_offset      => INTERVAL '1 hour',
  end_offset        => INTERVAL '1 minute',
  schedule_interval => INTERVAL '1 minute',
  if_not_exists     => TRUE
);

-- Compression configuration for Tiger Data storage optimization (90%+ ratio)
ALTER TABLE ergo_telemetry SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'session_id',
  timescaledb.compress_orderby = 'recorded_at DESC'
);

SELECT add_compression_policy('ergo_telemetry', INTERVAL '2 hours', if_not_exists => TRUE);

-- Composite index for O(1) sorted window scan on ergo_1min
CREATE INDEX IF NOT EXISTS idx_ergo_1min_session_bucket
ON ergo_1min (session_id, bucket ASC);

