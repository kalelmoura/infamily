"""Products endpoints — CRUD over the store's inventory (`/api/products`).

This is the Estoque module's backend: list, create, read, edit and delete
items. Straight CRUD, so the logic lives right here in the router — no
services layer. That comes later, for the sale transaction, where real
business rules (validate stock, deduct, snapshot prices, maybe create a
fiado) deserve a home of their own. Adding a service layer that only forwards
calls would be indirection without a payoff.

Two conventions this file follows everywhere:

  * **The endpoint owns the transaction.** `get_db` never commits; each
    endpoint commits explicitly. That keeps the boundary visible where the
    write happens — the habit that makes the sale transaction safe later.
  * **Never return an ORM object.** Every response is built with
    `ProductRead.model_validate(...)`, so the JSON shape is decided by the
    schema, not by whatever the model happens to hold.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models.product import Product
from app.schemas.product import ProductCreate, ProductRead, ProductUpdate

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


# The return annotation (`-> list[ProductRead]`) is what FastAPI reads to build
# the response model and the OpenAPI schema — no separate `response_model=`
# argument needed. A bare array is returned, exactly as the frontend expects.
@router.get("")
async def list_products(db: AsyncSession = Depends(get_db)) -> list[ProductRead]:
    """List every product, alphabetically by name."""
    # SQLAlchemy 2.0 style: build a `select()` statement, hand it to
    # `db.execute()`, then unpack the result. (The old 1.x `db.query(Product)`
    # API still exists but is legacy — and has no async equivalent.)
    result = await db.execute(select(Product).order_by(Product.name))
    # `.scalars()` again means "give me the Product objects, not (Product,)
    # rows"; `.all()` materialises them into a list.
    products = result.scalars().all()

    # No commit: this is a read. Closing the session (done by `get_db`) rolls
    # back the read-only transaction, which is free.
    return [ProductRead.model_validate(product) for product in products]


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
    return ProductRead.model_validate(product)


@router.get("/{product_id}")
async def get_product(
    # Typing the path parameter as `UUID` makes FastAPI parse and validate it:
    # a non-UUID id is a 422 and never reaches our query.
    product_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> ProductRead:
    """Fetch one product by id."""
    product = await _get_product_or_404(db, product_id)
    return ProductRead.model_validate(product)


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

    return ProductRead.model_validate(product)


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
