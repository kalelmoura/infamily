"""Sales endpoints — recording and reading sales (`/api/sales`).

Unlike `products.py`, this router is deliberately thin. Creating a sale is real
business logic, so it lives in `app/services/sales.py`; the job here is only to
translate between HTTP and that service: parse the body, call it, turn a
`SaleError` into a 400, shape the response.

Sales are append-only for now — no PATCH, no DELETE. A sale that already
deducted stock cannot simply be edited away, and the spec has no correction flow
yet, so the safe thing is to not offer one.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user
from app.database import get_db
from app.models.sale import Sale, SaleItem
from app.schemas.sale import SaleCreate, SaleItemRead, SaleRead
from app.services.sales import SaleError, create_sale

router = APIRouter(
    prefix="/api/sales",
    tags=["sales"],
    # Auth for the whole router, same reasoning as products.py: a new endpoint
    # added below is protected by default, and none of these need the claims.
    dependencies=[Depends(get_current_user)],
)


def _to_sale_read(sale: Sale) -> SaleRead:
    """Build the response schema from a Sale and its loaded relationships.

    Written out explicitly rather than leaning on `model_validate`, because
    `product_name` does not exist on `SaleItem` — it has to be reached through
    the `product` relationship. Doing it here also makes the eager-loading
    requirement obvious: every caller must have loaded `items` and each item's
    `product`, or `lazy="raise"` will say so.
    """
    return SaleRead(
        id=sale.id,
        client_id=sale.client_id,
        client_name=sale.client.full_name,
        sale_date=sale.sale_date,
        payment_method=sale.payment_method,
        total_amount=sale.total_amount,
        total_cost=sale.total_cost,
        created_at=sale.created_at,
        items=[
            SaleItemRead(
                id=item.id,
                product_id=item.product_id,
                product_name=item.product.name,
                quantity=item.quantity,
                unit_sale_price=item.unit_sale_price,
                unit_cost_price=item.unit_cost_price,
            )
            for item in sale.items
        ],
    )


@router.post("", status_code=status.HTTP_201_CREATED)
async def record_sale(
    payload: SaleCreate,
    db: AsyncSession = Depends(get_db),
) -> SaleRead:
    """Record a sale: validate stock, deduct it, snapshot prices, store totals.

    All of it in one transaction — see `services/sales.py`.
    """
    try:
        sale = await create_sale(db, payload)
    except SaleError as error:
        # 400, not 422: the request is well-formed JSON matching the schema, it
        # just describes a sale that cannot happen (not enough stock, unknown
        # product). 422 is FastAPI's code for "this body is malformed", which
        # would be misleading here.
        #
        # `str(error)` is the Portuguese message the service raised, written to
        # be shown to Yasmin as-is.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error

    # No eager loading needed: the service built these objects in memory and
    # attached each item's product, and `expire_on_commit=False` means the
    # commit did not invalidate them.
    return _to_sale_read(sale)


@router.get("")
async def list_sales(db: AsyncSession = Depends(get_db)) -> list[SaleRead]:
    """List sales, most recent first, each with its items."""
    # `selectinload` is what keeps this from being an N+1 storm: instead of one
    # query per sale to fetch items (and another per item for the product),
    # SQLAlchemy issues one extra query per level — three in total, whatever the
    # number of sales. It is also mandatory here rather than merely faster,
    # since `lazy="raise"` refuses to load these relationships on demand.
    result = await db.execute(
        select(Sale)
        .options(
            selectinload(Sale.client),
            selectinload(Sale.items).selectinload(SaleItem.product),
        )
        # `sale_date` is the business ordering; `created_at` breaks ties within
        # a single day, so two sales recorded on the same date still come back
        # newest-first and in a stable order.
        .order_by(Sale.sale_date.desc(), Sale.created_at.desc())
    )
    sales = result.scalars().all()

    return [_to_sale_read(sale) for sale in sales]


@router.get("/{sale_id}")
async def get_sale(
    sale_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> SaleRead:
    """Fetch one sale with its items."""
    result = await db.execute(
        select(Sale)
        .where(Sale.id == sale_id)
        .options(
            selectinload(Sale.client),
            selectinload(Sale.items).selectinload(SaleItem.product),
        )
    )
    sale = result.scalar_one_or_none()

    if sale is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Venda não encontrada",
        )

    return _to_sale_read(sale)
