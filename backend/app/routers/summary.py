"""Financial summary endpoint.

The figures here are derived on demand and computed with SQL aggregation:
Postgres sums the numbers and Python only shapes the one-row result. That keeps
the summary fast and avoids loading sales, items, or fiados into memory.
"""

from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, literal, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models.fiado import FiadoAccount
from app.models.product import Product
from app.models.sale import Sale, SaleItem
from app.schemas.sale import PaymentMethod
from app.schemas.summary import SummaryRead

router = APIRouter(
    prefix="/api/summary",
    tags=["summary"],
    dependencies=[Depends(get_current_user)],
)


def _zero_money():
    """A SQL literal that keeps empty sums as numeric zero."""
    return literal(Decimal("0.00"))


def _sale_date_filters(start_date: date | None, end_date: date | None):
    """Build reusable filters for a period over `sales.sale_date`."""
    filters = []
    if start_date is not None:
        filters.append(Sale.sale_date >= start_date)
    if end_date is not None:
        filters.append(Sale.sale_date <= end_date)
    return filters


@router.get("")
async def get_summary(
    start_date: date | None = None,
    end_date: date | None = None,
    db: AsyncSession = Depends(get_db),
) -> SummaryRead:
    """Return the five financial figures for the selected sale period."""
    if start_date is not None and end_date is not None and start_date > end_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A data inicial não pode ser maior que a data final.",
        )

    sale_filters = _sale_date_filters(start_date, end_date)

    total_sold = (
        select(func.coalesce(func.sum(Sale.total_amount), _zero_money()))
        .where(*sale_filters)
        .scalar_subquery()
    )

    sold_cost = (
        select(
            func.coalesce(
                func.sum(SaleItem.unit_cost_price * SaleItem.quantity),
                _zero_money(),
            )
        )
        .select_from(SaleItem)
        .scalar_subquery()
    )

    current_stock_cost = (
        select(
            func.coalesce(
                func.sum(Product.cost_price * Product.stock_quantity),
                _zero_money(),
            )
        )
        .select_from(Product)
        .scalar_subquery()
    )

    total_cost = sold_cost + current_stock_cost

    total_profit = (
        select(
            func.coalesce(
                func.sum(
                    (SaleItem.unit_sale_price - SaleItem.unit_cost_price)
                    * SaleItem.quantity
                ),
                _zero_money(),
            )
        )
        .select_from(SaleItem)
        .join(Sale, Sale.id == SaleItem.sale_id)
        .where(*sale_filters)
        .scalar_subquery()
    )

    received_immediate = (
        select(func.coalesce(func.sum(Sale.total_amount), _zero_money()))
        .where(Sale.payment_method != PaymentMethod.FIADO, *sale_filters)
        .scalar_subquery()
    )

    received_fiado = (
        select(
            func.coalesce(
                func.sum(Sale.total_amount - FiadoAccount.remaining_balance),
                _zero_money(),
            )
        )
        .select_from(FiadoAccount)
        .join(Sale, Sale.id == FiadoAccount.sale_id)
        .where(Sale.payment_method == PaymentMethod.FIADO, *sale_filters)
        .scalar_subquery()
    )

    to_receive = (
        select(func.coalesce(func.sum(FiadoAccount.remaining_balance), _zero_money()))
        .select_from(FiadoAccount)
        .join(Sale, Sale.id == FiadoAccount.sale_id)
        .where(*sale_filters)
        .scalar_subquery()
    )

    result = await db.execute(
        select(
            total_sold.label("total_sold"),
            total_cost.label("total_cost"),
            total_profit.label("total_profit"),
            (received_immediate + received_fiado).label("received"),
            to_receive.label("to_receive"),
        )
    )
    row = result.one()

    return SummaryRead(
        total_sold=row.total_sold,
        total_cost=row.total_cost,
        total_profit=row.total_profit,
        received=row.received,
        to_receive=row.to_receive,
    )
