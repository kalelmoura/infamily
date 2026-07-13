"""Authentication: verify Supabase access tokens on protected endpoints.

The backend never handles logins or passwords — the frontend authenticates
against Supabase Auth and receives a JWT access token. Every protected
request carries that token as `Authorization: Bearer <token>`, and this
module is the gate that verifies it before the endpoint code runs.

Verification is asymmetric: Supabase signs tokens with a private key it
never shares, and publishes the matching *public* keys at the JWKS URL
(JSON Web Key Set). We only ever hold public keys — there is no shared
secret that could leak from this server.
"""

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings

# Extracts the token from the `Authorization: Bearer <token>` header.
# `auto_error=False` makes a missing/malformed header yield None instead of
# FastAPI's default 403, so we can raise the proper 401 ourselves below
# (401 = "who are you?" / not authenticated; 403 = "I know you, but no").
bearer_scheme = HTTPBearer(auto_error=False)

# Created ONCE at import time, not per request: PyJWKClient caches the key
# set it downloads from Supabase (and refreshes it periodically), so the
# JWKS URL is only hit occasionally. A per-request client would throw that
# cache away and call Supabase on every API request.
jwks_client = jwt.PyJWKClient(settings.supabase_jwks_url)

# One reusable exception for every failure mode. Deliberately generic: the
# response must not reveal WHICH check failed (missing header, bad signature,
# expired, wrong audience), because that detail only helps an attacker probe.
# The WWW-Authenticate header is what RFC 6750 requires on a Bearer 401.
_credentials_error = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Não autenticado",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict:
    """Dependency that verifies the request's access token.

    Add `Depends(get_current_user)` to any endpoint to protect it: the
    endpoint body only runs if verification succeeds, and it receives the
    token's decoded claims (e.g. `sub` = the user's id) as this return value.

    Plain `def` (not `async def`) on purpose: PyJWKClient's key fetch is
    blocking I/O, and FastAPI runs sync dependencies in a worker thread so
    the event loop is never blocked.
    """
    if credentials is None:
        raise _credentials_error

    token = credentials.credentials

    try:
        # Step 1 — find the right public key. The token's (unverified) header
        # carries a `kid` (key id); the client looks that id up in the cached
        # key set. Nothing is trusted yet: a forged token can name a real kid,
        # but it cannot forge the signature that key is about to check.
        signing_key = jwks_client.get_signing_key_from_jwt(token)

        # Step 2 — verify and decode in one call. This checks:
        #   * signature  — token really was minted by Supabase, not altered;
        #   * exp        — token has not expired (checked by default);
        #   * audience   — `aud` claim equals "authenticated", Supabase's
        #                  audience for logged-in users (anon tokens differ).
        # `algorithms` is pinned to the asymmetric ones Supabase issues.
        # NEVER add HS256 here: accepting both symmetric and asymmetric
        # algorithms enables the classic algorithm-confusion attack, where a
        # public key is replayed as if it were an HMAC secret.
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256", "RS256"],
            audience="authenticated",
        )
    except jwt.exceptions.PyJWKClientError:
        # Key lookup failed: unknown `kid`, or the JWKS could not be fetched.
        raise _credentials_error
    except jwt.exceptions.InvalidTokenError:
        # Any verification failure: bad signature, expired, wrong audience,
        # or a string that is not a JWT at all. All collapse into the same
        # generic 401 on purpose.
        raise _credentials_error

    return claims
