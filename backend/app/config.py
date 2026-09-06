"""Application configuration.

Settings are read from environment variables (and a local `.env` file in dev)
using pydantic-settings. In Phase 0 the only setting we actually use is the
allowed CORS origin; database and auth settings are added in their own phases.
"""

from typing import Literal, Self
from urllib.parse import urlsplit
from uuid import UUID

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # `env_file=".env"` loads a local .env in development; in production the
    # platform (Render) injects real environment variables instead.
    # `extra="ignore"` lets the .env hold future variables (DATABASE_URL, etc.)
    # without breaking startup before those settings are declared here.
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Read from ENVIRONMENT; controls whether the API documentation is exposed.
    environment: Literal["development", "production"] = "development"

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

    @field_validator("frontend_origin")
    @classmethod
    def normalize_frontend_origin(cls, value: str) -> str:
        """Require one concrete HTTP(S) origin, never a wildcard or path."""
        normalized = value.strip().rstrip("/")
        parsed = urlsplit(normalized)

        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.netloc
            or parsed.path
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError("FRONTEND_ORIGIN must be one exact HTTP(S) origin")

        return normalized

    @field_validator("supabase_jwks_url")
    @classmethod
    def validate_jwks_url(cls, value: str) -> str:
        """Reject a JWKS URL that cannot belong to Supabase Auth."""
        normalized = value.strip()
        parsed = urlsplit(normalized)

        if (
            parsed.scheme != "https"
            or not parsed.netloc
            or not parsed.path.endswith("/auth/v1/.well-known/jwks.json")
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError("SUPABASE_JWKS_URL must be the HTTPS Auth JWKS URL")

        return normalized

    @field_validator("database_url")
    @classmethod
    def validate_database_driver(cls, value: str) -> str:
        """Fail early when the required async SQLAlchemy driver is missing."""
        if not value.startswith("postgresql+asyncpg://"):
            raise ValueError("DATABASE_URL must use postgresql+asyncpg://")
        return value

    @field_validator("owner_user_id")
    @classmethod
    def normalize_owner_user_id(cls, value: str | None) -> str | None:
        """Store the owner subject in the canonical UUID representation."""
        if value is None or not value.strip():
            return None

        try:
            return str(UUID(value.strip()))
        except ValueError as error:
            raise ValueError("OWNER_USER_ID must be a UUID") from error

    @model_validator(mode="after")
    def validate_production_settings(self) -> Self:
        """Production must fail at startup instead of running insecurely."""
        if self.environment == "production":
            if not self.frontend_origin.startswith("https://"):
                raise ValueError("FRONTEND_ORIGIN must use HTTPS in production")
            if not self.owner_user_id:
                raise ValueError("OWNER_USER_ID is required in production")

        return self


# Import this single instance wherever settings are needed:
#   from app.config import settings
settings = Settings()
