# 🐅 Developer 3: Cloud Brain, Tiger Data (TimescaleDB) & Gemini Persona
> **Target Tracks Supported**: Best Use of Gemini API, Best Use of Tiger Data, Best Use of Vultr, SpaceXSI A-Team  
> **Primary Language**: Python 3.10+ / FastAPI / SQL (TimescaleDB) / Google GenAI SDK  
> **Directory**: `backend/`

---

## 🎯 Your Mission Tonight
You own the **Cloud Ingestion & Telemetry Relay Server**, the **Tiger Data (TimescaleDB) Hypertables & Continuous Aggregates**, the **Google Gemini 2.5 Flash Persona Engine**, and the **SpaceXSI Grok Bot Discord/Slack Automation**. Your goal is to give sponsor judges overwhelming technical depth: blazing-fast time-series queries, real-time continuous aggregates, and hilarious, context-aware AI roasts.

---

## 📂 Files You Own
- **`app/main.py`**: FastAPI server, WebSocket endpoint (`/ws?token=...`) with 1-second batch flusher, and REST endpoints (`/health`, `/tiger-data/stats`, `/sessions/{id}/series`, `/sessions/{id}/summary`, `/grok-bot/webhook`).
- **`app/gemini/engine.py`**: Google Gemini 2.5 Flash Persona Engine with warm line cache (8 lines per cue for <10ms response), structured JSON output, 15 canned lines fallback, and end-of-session 3-sentence summary generator.
- **`app/db/schema.sql` & `database.py`**: TimescaleDB hypertable definitions (1-hour chunks), 1-minute real-time continuous aggregates (`ergo_1min`), strain velocity with windowed `LAG()`, 90%+ compression policy, and automatic SQLite fallback.
- **`app/grok_bot/service.py`**: Automated Discord/Slack webhook dispatch for personal, opt-in daily focus and posture summaries.
- **`scripts/seed_history.py`**: 7,200 data points history generator with manual continuous aggregate refresh.
- **`scripts/load_simulator.py`**: Streams 300 concurrent sessions at 1 Hz (~1,080,000 rows/hour) to demonstrate Tiger Data scalability to judges.
- **`docker-compose.yml`**: Full multi-container stack provisioning TimescaleDB (Postgres 16) and the FastAPI backend.

---

## ⚡ How to Work & Test Independently
You do **not** need the camera or the frontend running to develop, test, and tune the backend and database.

```bash
# 1. Activate virtual environment
source .venv/bin/activate    # Mac/Linux
# or .venv\Scripts\activate  # Windows

# 2. Run backend unit tests
pytest backend/tests/test_engine.py

# 3. Start FastAPI server locally (runs on SQLite fallback if Postgres is off)
python backend/app/main.py

# 4. (Optional) Run full PostgreSQL + TimescaleDB stack in Docker
docker compose up -d

# 5. Seed 2 hours of realistic focus/slouch history
python backend/scripts/seed_history.py

# 6. Run the 300-session Tiger Data load simulator
python backend/scripts/load_simulator.py
```

---

## 🐅 Tiger Data Continuous Aggregate SQL Cheatsheet

```sql
-- 1-minute continuous aggregate with real-time materialization enabled
CREATE MATERIALIZED VIEW ergo_1min
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
GROUP BY bucket, session_id;

-- Automated refresh policy
SELECT add_continuous_aggregate_policy('ergo_1min',
  start_offset      => INTERVAL '1 hour',
  end_offset        => INTERVAL '1 minute',
  schedule_interval => INTERVAL '1 minute');

-- Real-time fatigue velocity query for companion dashboard
SELECT bucket,
       avg_strain,
       avg_strain - LAG(avg_strain) OVER (ORDER BY bucket) AS strain_velocity
FROM ergo_1min
WHERE session_id = $1 AND bucket > now() - INTERVAL '30 minutes'
ORDER BY bucket;
```

---

## ♊ Google Gemini Structured Output Schema
The persona engine enforces deterministic JSON responses matching the pet's character:

```json
{
  "type": "intervention",
  "v": 1,
  "request_id": "req_123",
  "text": "You're folding like a lawn chair. Retract that chin!",
  "cue": "CHIN_TUCK",
  "instruction": "Pull your head straight back, hold 5 seconds, 3 times.",
  "severity": "WARNING",
  "source": "gemini"
}
```

### Deterministic Stretch Mapping (Never Hallucinated by LLM):
- `CHIN_TUCK`: Worst signal is `forward_head`
- `SHOULDER_ROLL`: Worst signal is `head_drop` or `head_pitch`
- `SIT_BACK`: Worst signal is `lean_in` or `tilt`
- `LOOK_AWAY`: Reason is `LOW_BLINK`
- `STAND_UP`: Reason is `LONG_SESSION`

---

## 🛠️ Tonight's Fine-Tuning Checklist
1. **Gemini API Key**: Add your `GEMINI_API_KEY` to `.env` and verify startup pre-warming logs:
   `Successfully cached 4 fresh lines for cue CHIN_TUCK`.
2. **Seed History**: Run `python backend/scripts/seed_history.py` so the Companion Dashboard shows a beautiful, realistic fatigue curve when judges open it.
3. **Tiger Data Demo Setup**: Practice launching `python backend/scripts/load_simulator.py` to show the judge live terminal ingestion:
   `[Tiger Data Load] Total rows: 35,400 | Ingestion Rate: 300.0 rows/s | Active Sessions: 300`.
4. **Grok Bot Webhook**: Set `GROK_WEBHOOK_URL` in `.env` to a Discord channel webhook to qualify for the SpaceXSI track. Test it via `POST /grok-bot/webhook?session_id=...`.
