"""Configuration settings for ErgoGotchi Backend Service."""

import os
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

class Settings(BaseModel):
    APP_NAME: str = "ErgoGotchi Telemetry & Persona Engine"
    API_V1_PREFIX: str = "/api/v1"
    
    # Security
    SHARED_TOKEN: str = os.getenv("SHARED_TOKEN", "ergogotchi_sunhacks_2026_secret")
    
    # Google Gemini API
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    # gemini-2.5-flash now returns 404 for new API keys
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
    GEMINI_TIMEOUT_MS: int = int(os.getenv("GEMINI_TIMEOUT_MS", "15000"))
    
    # Tiger Data / TimescaleDB
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql://postgres:postgres@localhost:5432/ergogotchi"
    )
    USE_SQLITE_FALLBACK: bool = os.getenv("USE_SQLITE_FALLBACK", "true").lower() in ("true", "1", "yes")
    SQLITE_DB_PATH: str = os.getenv("SQLITE_DB_PATH", "ergogotchi_local.db")
    
    # Grok Bot / SpaceXSI Webhook
    GROK_WEBHOOK_URL: str = os.getenv("GROK_WEBHOOK_URL", "")
    
    # Telemetry buffer & batching
    FLUSH_INTERVAL_SECONDS: float = 1.0
    BUFFER_MAX_SIZE: int = 500

settings = Settings()
