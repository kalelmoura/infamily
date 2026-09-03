"""Supabase Storage — where product photos actually live.

The counterpart to `images.py`: that module decides *what* bytes to keep, this
one puts them somewhere and takes them away again.

Two design notes worth understanding.

**Why raw HTTP instead of the `supabase` package.** The Python client would
pull in gotrue, postgrest, realtime and storage3 to perform, here, exactly two
requests. Storage is a plain REST API — an upload is a POST with the bytes as
the body — so `httpx` does the job with less to install and nothing hidden.

**Why the secret key.** Storage enforces RLS the same way the database does.
The secret key bypasses it, which is precisely why it is backend-only and why
the bucket needs no policies of its own: the only writer is this process, and
it is already behind `get_current_user`. Reads need no key at all — the bucket
is public-read, so the browser fetches photos straight from Supabase's CDN.
"""

import logging

import httpx
from fastapi import HTTPException, status

from app.config import settings

logger = logging.getLogger(__name__)

# Storage is not on the critical path for a page load, but it is on the path of
# a user waiting on a spinner. Ten seconds is long enough for a slow mobile
# upload to complete and short enough that a hung Supabase does not pin a
# worker indefinitely.
_TIMEOUT = httpx.Timeout(10.0)


def _auth_headers(secret_key: str) -> dict[str, str]:
    """The headers Supabase Storage wants for a project-level (admin) call.

    Both, deliberately. Supabase's current keys (`sb_secret_...`) are opaque
    strings and belong in `apikey` — sending one as `Authorization: Bearer` and
    nothing else fails with "Invalid Compact JWS", because Storage tries to
    parse a bearer token as a JWT and this is not one. The older
    `service_role` keys *were* JWTs and went in `Authorization`.

    Sending both is what the official Supabase clients do, and it means a
    project on either key format works without a code change.
    """
    return {
        "apikey": secret_key,
        "Authorization": f"Bearer {secret_key}",
    }


def _require_config() -> tuple[str, str]:
    """Return (project URL, secret key), or fail with a clear 503.

    Fails *closed*, the same way `get_current_user` does when OWNER_USER_ID is
    unset: a misconfigured deployment must refuse the operation rather than
    half-perform it. 503 (not 500) because the request was perfectly valid —
    the server is the thing that is not ready.
    """
    if not settings.supabase_url or not settings.supabase_secret_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Envio de fotos não está configurado no servidor.",
        )

    # `rstrip("/")` so a trailing slash in the env var does not produce a
    # double slash in every URL built below.
    return settings.supabase_url.rstrip("/"), settings.supabase_secret_key


def build_public_url(photo_path: str) -> str:
    """Compose the public CDN URL for a stored object path.

    Called on every product read, so it must not raise when Supabase is not
    configured — a listing with no photo URLs beats a listing that 503s.
    """
    if not settings.supabase_url:
        return ""

    base = settings.supabase_url.rstrip("/")
    bucket = settings.supabase_product_photos_bucket
    # The `/public/` segment is what makes this URL work with no Authorization
    # header. It only resolves for buckets marked public.
    return f"{base}/storage/v1/object/public/{bucket}/{photo_path}"


async def upload_photo(photo_path: str, data: bytes) -> None:
    """Upload JPEG bytes to the product-photos bucket.

    Raises an HTTPException on failure — unlike `delete_photo` below, this one
    is the user's actual request, so a failure has to be reported.
    """
    base_url, secret_key = _require_config()
    bucket = settings.supabase_product_photos_bucket

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.post(
                f"{base_url}/storage/v1/object/{bucket}/{photo_path}",
                headers={
                    **_auth_headers(secret_key),
                    # Storage records this and serves it back on every GET, so
                    # it decides how a browser will interpret the file. It is
                    # hardcoded rather than taken from the upload because
                    # images.py has already guaranteed the bytes are a JPEG —
                    # echoing a client-supplied type here would let someone
                    # have an image served as text/html.
                    "Content-Type": "image/jpeg",
                    # Overwrite rather than 409 if the path somehow exists.
                    # Paths carry a fresh UUID so this should never trigger; it
                    # costs nothing and removes a whole failure mode.
                    "x-upsert": "true",
                },
                content=data,
            )
    except httpx.HTTPError as error:
        # Network-level failure: DNS, TLS, timeout. The request never got an
        # answer, so there is no status code to inspect.
        logger.exception("Storage upload failed for %s", photo_path)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Não foi possível enviar a foto. Tente novamente.",
        ) from error

    if response.status_code >= 400:
        # Supabase answered, and said no — a missing bucket, a bad key, a file
        # over the bucket's size limit. The body explains which; it goes to the
        # log, not to the user, because it can name internal configuration.
        logger.error(
            "Storage upload rejected for %s: %s %s",
            photo_path,
            response.status_code,
            response.text,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Não foi possível enviar a foto. Tente novamente.",
        )


async def delete_photo(photo_path: str) -> None:
    """Remove an object from the bucket. Best-effort: never raises.

    Every caller of this function has already finished the work the user asked
    for — the new photo is stored, or the product row is gone. What is left is
    housekeeping: removing a file nothing points at any more. Letting that
    housekeeping turn a successful action into an error message would be
    exactly backwards, so failures are logged and swallowed. The worst case is
    an orphan file in the bucket, which costs a few hundred KB and nothing else.

    One measured caveat: deleting the object does **not** immediately stop the
    public URL from working. Supabase serves public buckets through Cloudflare,
    and the edge keeps answering `cf-cache-status: HIT` for a deleted object for
    some time after the delete succeeds. Nothing here depends on that being
    prompt — a replacement is always written to a *new* UUID path, so it has a
    URL the CDN has never seen, and a removal clears `photo_path` so the app
    stops linking to the old one regardless of what the edge still holds. Do not
    "simplify" the naming to a stable `{product_id}.jpg`: that would make the
    replaced photo's URL a cache hit on the *old* image, which is precisely the
    bug this avoids.
    """
    if not settings.supabase_url or not settings.supabase_secret_key:
        return

    base_url = settings.supabase_url.rstrip("/")
    bucket = settings.supabase_product_photos_bucket

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.delete(
                f"{base_url}/storage/v1/object/{bucket}/{photo_path}",
                headers=_auth_headers(settings.supabase_secret_key),
            )
        if response.status_code >= 400:
            logger.warning(
                "Could not delete orphan photo %s: %s %s",
                photo_path,
                response.status_code,
                response.text,
            )
    except httpx.HTTPError:
        logger.warning("Could not delete orphan photo %s", photo_path, exc_info=True)
