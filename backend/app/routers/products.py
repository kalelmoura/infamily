"""Products endpoints — CRUD over the store's inventory (`/api/products`).

This is the Estoque module's backend: list, create, read, edit and delete
items, plus the item's photo. The CRUD half is straight CRUD, so its logic
lives right here in the router — a service layer that only forwarded calls
would be indirection without a payoff.

The photo half is the exception, and it is worth seeing why. Uploading means
validating and re-encoding an image, then talking to an external service over
HTTP — neither of which is "handling a request", and both of which are worth
testing without a web server in the way. So they live in `app/services/`:
`images.py` (bytes in, bytes out) and `storage.py` (the Supabase calls). What
stays here is the part that genuinely is the endpoint's job: the order the
steps run in, and which failure maps to which status code.

Two conventions this file follows everywhere:

  * **The endpoint owns the transaction.** `get_db` never commits; each
    endpoint commits explicitly. That keeps the boundary visible where the
    write happens — the habit that makes the sale transaction safe later.
  * **Never return an ORM object.** Every response is built with
    `ProductRead.model_validate(...)`, so the JSON shape is decided by the
    schema, not by whatever the model happens to hold.
"""

from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models.product import Product
from app.models.sale import SaleItem
from app.schemas.product import ProductCreate, ProductRead, ProductUpdate
from app.services.images import normalize_product_photo
from app.services.storage import build_public_url, delete_photo, upload_photo

# Refuse anything larger before spending CPU decoding it. `UploadFile` spools
# to a temp file past 1 MB, so this is not about running out of memory — it is
# about not decoding a 200 MB file someone sent to see what happens. Ten MB is
# comfortably above any phone photo.
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
UPLOAD_READ_CHUNK_BYTES = 1024 * 1024

# The formats a browser will hand over from a phone's camera or gallery. This
# check is only the cheap first pass — the header is client-supplied and can
# lie, so the real proof is Pillow decoding the bytes further down.
ALLOWED_PHOTO_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}

router = APIRouter(
    # The full path of every route below = this prefix + the route's own path.
    # No trailing slash, so `GET /api/products` (what the frontend will call,
    # and what the spec lists) matches directly instead of being answered with
    # a 307 redirect to `/api/products/`.
    prefix="/api/products",
    # Groups these routes under a "products" heading in the /docs page.
    tags=["products"],
    # Auth for the whole router instead of a parameter on each function. Two
    # reasons: (1) a new endpoint added below is protected by default — you
    # cannot forget it, which is the failure mode that matters; (2) none of
    # these endpoints actually *use* the token's claims (this is a single-store
    # system — every logged-in user sees the same inventory), so injecting them
    # into five signatures would add five unused parameters. `dependencies=[...]`
    # is FastAPI's way to say "run this check, discard its return value".
    dependencies=[Depends(get_current_user)],
)


async def _read_photo_with_limit(file: UploadFile) -> bytes:
    """Read at most one chunk beyond the limit before rejecting the upload."""
    contents = bytearray()

    while chunk := await file.read(UPLOAD_READ_CHUNK_BYTES):
        contents.extend(chunk)
        if len(contents) > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail="A imagem é muito grande. O limite é 10 MB.",
            )

    return bytes(contents)


async def _get_product_or_404(db: AsyncSession, product_id: UUID) -> Product:
    """Load one product by id, or raise a 404.

    Three endpoints need exactly this, so it lives in one place — a private
    helper, not a service: it has no business rules, it is just the lookup
    plus the error the API promises.

    Returns the *ORM object* on purpose: callers still need a live, session-
    attached instance to mutate (PATCH) or delete. Converting to `ProductRead`
    is the caller's last step, right before returning.
    """
    result = await db.execute(select(Product).where(Product.id == product_id))
    # `scalar_one_or_none()` unpacks the result: rows come back as tuples of
    # (Product,) — "scalar" takes the first column, "one_or_none" gives the
    # object, or None if there was no match (and raises if there were several,
    # which cannot happen on a primary key).
    product = result.scalar_one_or_none()

    if product is None:
        # User-facing text is Portuguese; the code around it stays English.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Produto não encontrado",
        )

    return product


def _to_read(product: Product, sold_quantity: int = 0) -> ProductRead:
    """Build the API response for one product.

    Two of `ProductRead`'s fields cannot come from the ORM object directly:

      * `sold_quantity` is an aggregate over `sale_items`, computed by whichever
        endpoint needs it (only the list does — elsewhere it stays 0);
      * `photo_url` is derived from the internal `photo_path` plus the bucket
        configuration, so the frontend never learns the storage layout.

    `model_copy(update=...)` is how Pydantic sets fields the source object did
    not have. Routing every endpoint through this one function is what stops
    the two from drifting — before it existed, only the list endpoint filled in
    `sold_quantity`, and adding `photo_url` in five places would have been five
    chances to forget one.
    """
    return ProductRead.model_validate(product).model_copy(
        update={
            "sold_quantity": sold_quantity,
            "photo_url": (
                build_public_url(product.photo_path) if product.photo_path else None
            ),
        }
    )


# The return annotation (`-> list[ProductRead]`) is what FastAPI reads to build
# the response model and the OpenAPI schema — no separate `response_model=`
# argument needed. A bare array is returned, exactly as the frontend expects.
@router.get("")
async def list_products(db: AsyncSession = Depends(get_db)) -> list[ProductRead]:
    """List every product, alphabetically by name, with total units sold."""
    # SQLAlchemy 2.0 style: build a `select()` statement, hand it to
    # `db.execute()`, then unpack the result. (The old 1.x `db.query(Product)`
    # API still exists but is legacy — and has no async equivalent.)
    sold_quantities = (
        select(
            SaleItem.product_id,
            func.coalesce(func.sum(SaleItem.quantity), 0).label("sold_quantity"),
        )
        .group_by(SaleItem.product_id)
        .subquery()
    )

    result = await db.execute(
        select(
            Product,
            func.coalesce(sold_quantities.c.sold_quantity, 0).label(
                "sold_quantity"
            ),
        )
        .outerjoin(sold_quantities, sold_quantities.c.product_id == Product.id)
        .order_by(Product.name)
    )
    rows = result.all()

    # No commit: this is a read. Closing the session (done by `get_db`) rolls
    # back the read-only transaction, which is free.
    return [
        _to_read(product, int(sold_quantity)) for product, sold_quantity in rows
    ]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_product(
    payload: ProductCreate,
    db: AsyncSession = Depends(get_db),
) -> ProductRead:
    """Create a product. Returns 201 with the created row."""
    # `payload` is already validated — if execution reaches this line, the name
    # is non-empty and the numbers are non-negative and fit NUMERIC(10, 2).
    #
    # `model_dump()` turns the schema into a plain dict, and `**` spreads it
    # into the model's constructor. This is safe *because* ProductCreate cannot
    # carry unexpected keys (`extra="forbid"`): the dict holds exactly the four
    # writable columns, so `id`, `created_at` and `updated_at` are left to the
    # database's defaults. Never spread a raw request body like this.
    product = Product(**payload.model_dump())

    # `add` only stages the object in the session; no SQL has run yet.
    db.add(product)
    # `commit` flushes (emits the INSERT) and commits the transaction. This is
    # the transaction boundary the module docstring mentions — until this line,
    # nothing is persisted, and any exception above leaves the database
    # untouched.
    await db.commit()

    # No `db.refresh(product)` needed, and that is not an oversight:
    #   * on Postgres, SQLAlchemy 2.0 fetches server-generated defaults with an
    #     INSERT ... RETURNING, so `id`, `created_at` and `updated_at` are
    #     already populated on the object by the time the flush finishes;
    #   * `expire_on_commit=False` (see database.py) means commit does not
    #     invalidate them.
    # So the object is fully readable here without a second round-trip.
    return _to_read(product)


@router.get("/{product_id}")
async def get_product(
    # Typing the path parameter as `UUID` makes FastAPI parse and validate it:
    # a non-UUID id is a 422 and never reaches our query.
    product_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> ProductRead:
    """Fetch one product by id."""
    product = await _get_product_or_404(db, product_id)
    return _to_read(product)


@router.patch("/{product_id}")
async def update_product(
    product_id: UUID,
    payload: ProductUpdate,
    db: AsyncSession = Depends(get_db),
) -> ProductRead:
    """Partially update a product — only the fields present in the body."""
    product = await _get_product_or_404(db, product_id)

    # `exclude_unset=True` is the heart of PATCH: it keeps only the keys the
    # client actually sent. Without it, every omitted field would come back as
    # None and wipe the stored value.
    #
    # `exclude_none=True` drops an explicit `{"name": null}`. No product column
    # is nullable, so "set this to null" has no valid meaning here — dropping it
    # is the difference between ignoring a meaningless instruction and letting a
    # NOT NULL violation blow up as a 500.
    changes = payload.model_dump(exclude_unset=True, exclude_none=True)

    # Assigning to the loaded object is the whole update: SQLAlchemy tracks the
    # changed attributes and emits a single UPDATE at flush time, touching only
    # those columns. `updated_at` is bumped automatically by the model's
    # `onupdate=func.now()`.
    for field, value in changes.items():
        setattr(product, field, value)

    # An empty PATCH body ends up here with nothing dirty: SQLAlchemy simply
    # emits no UPDATE, and the endpoint returns the product unchanged.
    await db.commit()

    return _to_read(product)


# 204 No Content is the right answer to a successful DELETE: the resource is
# gone, so there is nothing meaningful to send back. Returning `None` from a
# 204 endpoint produces a genuinely empty body (an HTTP 204 must not have one).
@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(
    product_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a product."""
    product = await _get_product_or_404(db, product_id)

    # The spec's "blocked if it has sales history" rule. The guarantee itself
    # lives in the database: `sale_items.product_id` is declared ON DELETE
    # RESTRICT, so Postgres refuses the DELETE outright and history can never be
    # rewritten by a cascade — no matter who is doing the deleting.
    #
    # What this block adds is a *civil* answer. Without it the driver's foreign
    # key violation would bubble up as an unhandled 500, and Yasmin would see a
    # crash where she should see an explanation.
    #
    # Checking first with a `SELECT ... WHERE EXISTS` instead would be a race:
    # a sale could be recorded between the check and the delete. Letting the
    # constraint decide is both simpler and correct under concurrency.
    # Captured before the delete: once the object is gone from the session,
    # reading its attributes is no longer reliable.
    photo_path = product.photo_path

    try:
        await db.delete(product)
        await db.commit()
    except IntegrityError as error:
        # The transaction is aborted once Postgres rejects a statement; roll it
        # back explicitly so the session is reusable and the connection returns
        # to the pool clean.
        await db.rollback()
        # 409 Conflict: the request is valid, but the resource's current state
        # (it has sales) forbids it. Not 400 — nothing about the request is
        # wrong — and not 403, which would be about permissions.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Este produto já foi vendido e não pode ser excluído. "
                "Para tirá-lo da loja, defina a quantidade em estoque como 0."
            ),
        ) from error

    # Only once the row is really gone: the photo has nothing left pointing at
    # it, so leaving it would be an orphan paid for forever. Deliberately after
    # the commit, never before — if the delete had been refused above, the
    # product still exists and still needs its photo.
    if photo_path:
        await delete_photo(photo_path)


# --- Photo ------------------------------------------------------------------
# One photo per product, stored in Supabase Storage. PUT rather than POST
# because this replaces the single photo sub-resource: sending it twice leaves
# the same end state, which is exactly what makes a retry safe after a flaky
# mobile connection.


@router.put("/{product_id}/photo")
async def upload_product_photo(
    product_id: UUID,
    # `File(...)` marks this as a multipart form field rather than a JSON body,
    # and the parameter name is the field name the frontend must send.
    # `UploadFile` streams to a spooled temp file instead of loading the whole
    # request into memory up front.
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
) -> ProductRead:
    """Attach or replace a product's photo."""
    product = await _get_product_or_404(db, product_id)

    if file.content_type not in ALLOWED_PHOTO_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Envie uma imagem JPG, PNG ou WEBP.",
        )

    # Read in bounded chunks so an attacker cannot make the process allocate
    # an arbitrarily large byte string before the 10 MB limit is checked.
    raw = await _read_photo_with_limit(file)

    if not raw:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="O arquivo enviado está vazio.",
        )

    try:
        # The real validation: bytes that do not decode are not an image, no
        # matter what the Content-Type above claimed. This also strips EXIF
        # (GPS included — the bucket is public) and fixes phone rotation.
        photo_bytes = normalize_product_photo(raw)
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Não foi possível ler a imagem. Tente outra foto.",
        ) from error

    previous_path = product.photo_path
    # A fresh random name on every replace, rather than a stable
    # "{product_id}.jpg". The bucket is public and served through a CDN, so
    # reusing the path would leave browsers and the CDN showing the *old*
    # picture at a URL whose contents changed. A new name is a new URL, which
    # sidesteps cache invalidation entirely.
    photo_path = f"{product.id}/{uuid4().hex}.jpg"

    # Order matters, and this is the whole reason the steps are spelled out
    # here rather than hidden in a service: upload first, commit second, delete
    # the old object last. If the commit fails, the worst outcome is one orphan
    # file nothing references. Reverse the first two and a failure leaves a row
    # pointing at a file that was never stored — a broken image, permanently.
    await upload_photo(photo_path, photo_bytes)

    product.photo_path = photo_path
    await db.commit()

    if previous_path:
        # Best-effort by design: the user's request has already succeeded, so a
        # failed cleanup must not turn into an error message.
        await delete_photo(previous_path)

    return _to_read(product)


@router.delete("/{product_id}/photo", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product_photo(
    product_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Remove a product's photo, leaving the product itself untouched."""
    product = await _get_product_or_404(db, product_id)

    photo_path = product.photo_path
    if photo_path is None:
        # Already true. Answering 204 rather than 404 keeps the endpoint
        # idempotent — a double tap on "Remover foto" should not produce an
        # error for something that is in the state the user asked for.
        return

    # Clear the reference first, remove the file after. The row is the source
    # of truth about whether a product has a photo; if the file deletion fails,
    # an orphan in the bucket is invisible to everyone, while a row still
    # pointing at a deleted file would render as a broken image.
    product.photo_path = None
    await db.commit()

    await delete_photo(photo_path)
