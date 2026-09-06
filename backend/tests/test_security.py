"""Security boundary checks that must stay true in production."""

import pytest

from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.config import Settings
from app.database import get_db
from app.main import app


client = TestClient(app)


def production_settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "_env_file": None,
        "database_url": "postgresql+asyncpg://user:password@localhost/infamily",
        "environment": "production",
        "frontend_origin": "https://example.com",
        "owner_user_id": "00000000-0000-4000-8000-000000000000",
        "supabase_jwks_url": (
            "https://example.supabase.co/auth/v1/.well-known/jwks.json"
        ),
    }
    values.update(overrides)
    return Settings(**values)


def test_production_configuration_requires_https_frontend() -> None:
    with pytest.raises(ValidationError):
        production_settings(frontend_origin="http://example.com")


def test_production_configuration_requires_owner() -> None:
    with pytest.raises(ValidationError):
        production_settings(owner_user_id=None)


def test_health_is_public_and_hardened() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["referrer-policy"] == "no-referrer"


def test_api_docs_are_disabled_in_production() -> None:
    assert client.get("/docs").status_code == 404
    assert client.get("/redoc").status_code == 404
    assert client.get("/openapi.json").status_code == 404


def test_readiness_checks_database_connectivity() -> None:
    class ReadyDatabase:
        async def execute(self, statement: object) -> None:
            assert str(statement) == "SELECT 1"

    async def override_database():
        yield ReadyDatabase()

    app.dependency_overrides[get_db] = override_database
    try:
        response = client.get("/ready")
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert response.status_code == 200
    assert response.json() == {"status": "ready"}


def test_protected_route_rejects_missing_token_without_caching() -> None:
    response = client.get("/api/me")

    assert response.status_code == 401
    assert response.json() == {"detail": "Não autenticado"}
    assert response.headers["cache-control"] == "no-store"


def test_configured_frontend_origin_passes_cors_preflight() -> None:
    response = client.options(
        "/api/products",
        headers={
            "Origin": "https://example.com",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "Authorization",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://example.com"
    assert "GET" in response.headers["access-control-allow-methods"]
    assert "authorization" in response.headers["access-control-allow-headers"].lower()
    assert "access-control-allow-credentials" not in response.headers


def test_unknown_origin_fails_cors_preflight() -> None:
    response = client.options(
        "/api/products",
        headers={
            "Origin": "https://attacker.example",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "Authorization",
        },
    )

    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers
