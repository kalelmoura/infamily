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

    # Read from ENVIRONMENT; controls whether the API documentation is exposed.
    environment: str = "development"

    # Allowed CORS origin (the frontend). Defaults to the local Next.js dev
    # server so the app runs out of the box with no .env file.
    frontend_origin: str = "http://localhost:3000"

    # Supabase JWKS endpoint: where Supabase publishes the public keys used
    # to verify access-token signatures. No default on purpose — auth cannot
    # work without it, so the app should fail at startup (with a clear
    # pydantic error) rather than fail confusingly on the first request.
    supabase_jwks_url: str

    # The single Supabase Auth user allowed to access protected routes. This
    # defaults to None so the service can still start when misconfigured, but
    # auth fails closed: get_current_user rejects every token until this is set.
    # Pydantic Settings reads this field from OWNER_USER_ID.
    owner_user_id: str | None = None

    # Postgres connection string for SQLAlchemy's async engine. It MUST use
    # the asyncpg driver — note the `+asyncpg` in the scheme:
    #   postgresql+asyncpg://USER:PASSWORD@HOST:5432/postgres
    # No default, for the same reason as supabase_jwks_url above: the app is
    # useless without a database, so it should fail fast at startup (with a
    # clear pydantic error) rather than limp along and break on the first
    # query. Backend-only — this string is a secret, never expose it to the
    # frontend.
    database_url: str

    # --- Supabase Storage (product photos) ---------------------------------
    # The backend uploads product photos to a Supabase Storage bucket over the
    # Storage REST API, which needs the project URL and the *secret* key. The
    # secret key bypasses storage RLS — it is backend-only and must never
    # reach the browser.
    #
    # Both default to None rather than being required, unlike database_url
    # above. The reasoning is different for each: without a database nothing
    # works at all, so failing at startup is the kindest outcome; without
    # these, everything except photo upload still works, so taking the whole
    # service down would be a worse trade. Instead they fail *closed* at the
    # point of use — app/services/storage.py answers 503 while they are unset,
    # the same pattern owner_user_id follows.
    supabase_url: str | None = None
    supabase_secret_key: str | None = None

    # Name of the (public-read) bucket holding product photos. A setting
    # rather than a constant so a staging environment can point at its own
    # bucket without a code change.
    supabase_product_photos_bucket: str = "product-photos"


# Import this single instance wherever settings are needed:
#   from app.config import settings
settings = Settings()
