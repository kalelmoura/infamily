"""Dashboard endpoint — overdue fiados, due-soon fiados, and low stock.

This router deliberately stays read-only and thin. It reuses
`services/fiado.derive_status()` for the fiado grouping because status is a
derived rule, not a column; writing the same overdue/due-soon conditions here in
SQL would create a second implementation to keep in sync.
"""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models.fiado import FiadoAccount
from app.models.product import Product
from app.schemas.dashboard import (
    DashboardDueSoonFiadoRead,
    DashboardLowStockProductRead,
    DashboardOverdueFiadoRead,
    DashboardRead,
)
from app.schemas.fiado import FiadoStatus
from app.services.fiado import derive_status, today_in_store

LOW_STOCK_THRESHOLD = 2

router = APIRouter(
    prefix="/api/dashboard",
    tags=["dashboard"],
    dependencies=[Depends(get_current_user)],
)


@router.get("")
async def get_dashboard(db: AsyncSession = Depends(get_db)) -> DashboardRead:
    """Return the three dashboard groups in one response."""
    today = today_in_store()

    fiado_result = await db.execute(
        select(FiadoAccount).where(FiadoAccount.remaining_balance > 0)
    )
    fiados = fiado_result.scalars().all()

    overdue: list[DashboardOverdueFiadoRead] = []
    due_soon: list[DashboardDueSoonFiadoRead] = []

    for fiado in fiados:
        status = derive_status(fiado.next_due_date, fiado.remaining_balance, today)

        if status == FiadoStatus.OVERDUE:
            overdue.append(
                DashboardOverdueFiadoRead(
                    id=fiado.id,
                    customer_name=fiado.customer_name,
                    next_due_date=fiado.next_due_date,
                    remaining_balance=fiado.remaining_balance,
                    days_overdue=(today - fiado.next_due_date).days,
                )
            )
        elif status == FiadoStatus.DUE_SOON:
            due_soon.append(
                DashboardDueSoonFiadoRead(
                    id=fiado.id,
                    customer_name=fiado.customer_name,
                    next_due_date=fiado.next_due_date,
                    remaining_balance=fiado.remaining_balance,
                )
            )

    overdue.sort(key=lambda item: item.days_overdue, reverse=True)
    due_soon.sort(key=lambda item: item.next_due_date)

    product_result = await db.execute(
        select(Product)
        .where(Product.stock_quantity <= LOW_STOCK_THRESHOLD)
        .order_by(Product.stock_quantity, Product.name)
    )
    low_stock = [
        DashboardLowStockProductRead.model_validate(product)
        for product in product_result.scalars().all()
    ]

    return DashboardRead(
        overdue=overdue,
        due_soon=due_soon,
        low_stock=low_stock,
    )
