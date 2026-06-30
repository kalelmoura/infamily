"""Application configuration.

Settings are read from environment variables (and a local `.env` file in dev)
using pydantic-settings. In Phase 0 the only setting we actually use is the
allowed CORS origin; database and auth settings are added in their own phases.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # `env_file=".env"` loads a local .env in development; in production the
    # platform (Render) injects real environment variables instead.
    # `extra="ignore"` lets the .env hold future variables (DATABASE_URL, etc.)
    # without breaking startup before those settings are declared here.
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Allowed CORS origin (the frontend). Defaults to the local Next.js dev
    # server so the app runs out of the box with no .env file.
    frontend_origin: str = "http://localhost:3000"


# Import this single instance wherever settings are needed:
#   from app.config import settings
settings = Settings()
