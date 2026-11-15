"""Configuration settings for ErgoGotchi Backend Service."""

import os
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

def _get_int(key: str, default: int) -> int:
    val = os.getenv(key, "")
    try:
        return int(val) if val.strip() else default
    except (ValueError, TypeError):
        return default

def _get_bool(key: str, default: bool) -> bool:
    val = os.getenv(key)
    if val is None or val.strip() == "":
        return default
    return val.strip().lower() in ("true", "1", "yes", "on")

class Settings(BaseModel):
    APP_NAME: str = "ErgoGotchi Telemetry & Persona Engine"
    API_V1_PREFIX: str = "/api/v1"
    
    # Security
    SHARED_TOKEN: str = os.getenv("SHARED_TOKEN", "ergogotchi_sunhacks_2026_secret")
    
    # Google Gemini API
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    # gemini-2.5-flash now returns 404 for new API keys
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
    GEMINI_TIMEOUT_MS: int = _get_int("GEMINI_TIMEOUT_MS", 15000)
    
    # Tiger Data / TimescaleDB
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql://postgres:postgres@localhost:5432/ergogotchi"
    )
    USE_SQLITE_FALLBACK: bool = _get_bool("USE_SQLITE_FALLBACK", True)
    SQLITE_DB_PATH: str = os.getenv("SQLITE_DB_PATH", "ergogotchi_local.db")
    
    # Grok Bot / SpaceXSI Webhook
    GROK_WEBHOOK_URL: str = os.getenv("GROK_WEBHOOK_URL", "")
    
    # Telemetry buffer & batching
    FLUSH_INTERVAL_SECONDS: float = 1.0
    BUFFER_MAX_SIZE: int = 500

settings = Settings()
