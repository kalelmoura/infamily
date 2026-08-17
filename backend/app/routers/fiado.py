"""Fiado endpoints — the collection screen (`/api/fiado`).

Note what is *not* here: there is no `POST /api/fiado`. A fiado is opened by
recording a credit sale, so the only way to create one is `POST /api/sales` with
the terms attached (spec section 2 — a sale and a fiado are the same event).
This router only reads the resulting debts and records payments against them.

Like `routers/sales.py`, it stays thin: the rules (what counts as overdue, how
much an installment is, how a payment moves the balance and the date) live in
`services/fiado.py`, and the job here is to translate between HTTP and that.
"""

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user
from app.database import get_db
from app.models.fiado import FiadoAccount
from app.models.sale import Sale, SaleItem
from app.schemas.fiado import FiadoDetailItemRead, FiadoDetailRead, FiadoRead
from app.services.fiado import (
    STATUS_ORDER,
    FiadoError,
    apply_installment_payment,
    derive_status,
    today_in_store,
)

router = APIRouter(
    prefix="/api/fiado",
    tags=["fiado"],
    # Auth for the whole router, same reasoning as the other two: an endpoint
    # added below is protected by default rather than by remembering to.
    dependencies=[Depends(get_current_user)],
)


def _to_fiado_read(fiado: FiadoAccount, today: date) -> FiadoRead:
    """Build the list/summary response, deriving `status` for `today`.

    Written by hand rather than with `model_validate(fiado)` because `status`
    has no column behind it — it is computed per request, and the ORM object has
    nothing to read it from.
    """
    return FiadoRead(
        id=fiado.id,
        sale_id=fiado.sale_id,
        customer_name=fiado.customer_name,
        frequency=fiado.frequency,
        installments_count=fiado.installments_count,
        installment_amount=fiado.installment_amount,
        agreed_settlement_date=fiado.agreed_settlement_date,
        next_due_date=fiado.next_due_date,
        remaining_balance=fiado.remaining_balance,
        status=derive_status(fiado.next_due_date, fiado.remaining_balance, today),
        created_at=fiado.created_at,
        updated_at=fiado.updated_at,
    )


@router.get("")
async def list_fiados(db: AsyncSession = Depends(get_db)) -> list[FiadoRead]:
    """List every fiado with its derived status — the collection screen.

    Ordered so the ones that need chasing come first: overdue, then due soon,
    then current, with settled debts last; within a group, the earliest due date
    first.

    That ordering happens in Python, not SQL, because `status` is derived from
    today's date and does not exist as a column. Expressing it as a SQL CASE
    would mean writing the same rules a second time, in a second language, and
    keeping them in step forever. Sorting a list the store can hold in its head
    costs nothing; if the fiado list ever grows past what one screen can page
    through, this is the trade to revisit.
    """
    result = await db.execute(select(FiadoAccount))
    fiados = result.scalars().all()

    # One `today` for the whole listing: computing it per row would let a
    # request that straddles midnight classify its first and last rows against
    # different days.
    today = today_in_store()

    responses = [_to_fiado_read(fiado, today) for fiado in fiados]
    responses.sort(key=lambda item: (STATUS_ORDER[item.status], item.next_due_date))

    return responses


@router.get("/{fiado_id}")
async def get_fiado(
    fiado_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> FiadoDetailRead:
    """One fiado with the sale behind it — the terms plus what the person took."""
    # Three levels of eager loading: the fiado's sale, that sale's items, and
    # each item's product (for the name). `selectinload` issues one extra query
    # per level rather than one per row, and it is mandatory rather than merely
    # faster here — `lazy="raise"` refuses to load these on demand.
    result = await db.execute(
        select(FiadoAccount)
        .where(FiadoAccount.id == fiado_id)
        .options(
            selectinload(FiadoAccount.sale)
            .selectinload(Sale.items)
            .selectinload(SaleItem.product)
        )
    )
    fiado = result.scalar_one_or_none()

    if fiado is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Fiado não encontrado",
        )

    summary = _to_fiado_read(fiado, today_in_store())

    return FiadoDetailRead(
        # `**summary.model_dump()` spreads the fields the two schemas share
        # (FiadoDetailRead inherits from FiadoRead), so the derived status and
        # every other field are built in exactly one place, above.
        **summary.model_dump(),
        sale_date=fiado.sale.sale_date,
        sale_total=fiado.sale.total_amount,
        items=[
            FiadoDetailItemRead(
                id=item.id,
                product_id=item.product_id,
                product_name=item.product.name,
                quantity=item.quantity,
                unit_sale_price=item.unit_sale_price,
            )
            for item in fiado.sale.items
        ],
    )


@router.post("/{fiado_id}/pay")
async def pay_installment(
    fiado_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> FiadoRead:
    """Record one installment as paid: reduce the balance, advance the date.

    POST, not PATCH: this is not "set the balance to X", it is "an event
    happened" — the client sends no body at all, and the server decides what the
    payment does. That also makes the request impossible to get wrong from the
    UI, which matters when the caller is a single button.
    """
    # `with_for_update()` locks this row for the rest of the transaction, the
    # same protection `services/sales.py` gives stock. Two taps on the button
    # racing each other would otherwise both read the same balance and both
    # write the same reduced value — one payment lost, and the customer charged
    # twice for one installment. The second request now waits here and, on
    # resuming, re-reads the balance the first one committed.
    result = await db.execute(
        select(FiadoAccount).where(FiadoAccount.id == fiado_id).with_for_update()
    )
    fiado = result.scalar_one_or_none()

    if fiado is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Fiado não encontrado",
        )

    try:
        apply_installment_payment(fiado)
    except FiadoError as error:
        # 400 for the same reason as in `routers/sales.py`: the request is
        # well-formed, it just asks for something that cannot happen (paying an
        # already settled debt). The message is the Portuguese one the service
        # raised, shown to Yasmin as-is.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error

    # The single commit: the new balance and the new due date land together, and
    # the row lock is released here.
    await db.commit()

    # Safe to read `fiado` after the commit thanks to `expire_on_commit=False`;
    # the status is recomputed from the values just written, so the response
    # already shows "quitado" when this payment settled the debt.
    return _to_fiado_read(fiado, today_in_store())
