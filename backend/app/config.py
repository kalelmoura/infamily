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

    # Supabase JWKS endpoint: where Supabase publishes the public keys used
    # to verify access-token signatures. No default on purpose — auth cannot
    # work without it, so the app should fail at startup (with a clear
    # pydantic error) rather than fail confusingly on the first request.
    supabase_jwks_url: str

    # Postgres connection string for SQLAlchemy's async engine. It MUST use
    # the asyncpg driver — note the `+asyncpg` in the scheme:
    #   postgresql+asyncpg://USER:PASSWORD@HOST:5432/postgres
    # No default, for the same reason as supabase_jwks_url above: the app is
    # useless without a database, so it should fail fast at startup (with a
    # clear pydantic error) rather than limp along and break on the first
    # query. Backend-only — this string is a secret, never expose it to the
    # frontend.
    database_url: str


# Import this single instance wherever settings are needed:
#   from app.config import settings
settings = Settings()
