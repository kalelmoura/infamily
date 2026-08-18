"""Client CRUD and purchase-history endpoints (`/api/clients`)."""

from decimal import Decimal
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user
from app.constants import WALK_IN_CLIENT_ID
from app.database import get_db
from app.models.client import Client
from app.models.fiado import FiadoAccount
from app.models.sale import Sale, SaleItem
from app.schemas.client import (
    ClientCreate,
    ClientDetailRead,
    ClientRead,
    ClientSaleItemRead,
    ClientSaleRead,
    ClientUpdate,
)

router = APIRouter(
    prefix="/api/clients",
    tags=["clients"],
    dependencies=[Depends(get_current_user)],
)


def _to_client_read(client: Client) -> ClientRead:
    """Shape a client without exposing ORM internals."""
    return ClientRead.model_validate(client)


async def _get_client_or_404(db: AsyncSession, client_id: UUID) -> Client:
    """Load one client or return the API's standard not-found response."""
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()

    if client is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cliente não encontrado",
        )

    return client


def _search_pattern(query: str) -> str:
    """Escape SQL wildcard characters so search text is treated literally."""
    escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


@router.get("")
async def list_clients(
    q: Annotated[str | None, Query(max_length=200)] = None,
    db: AsyncSession = Depends(get_db),
) -> list[ClientRead]:
    """List clients alphabetically, optionally matching name or phone."""
    statement = select(Client)

    search = q.strip() if q is not None else ""
    if search:
        pattern = _search_pattern(search)
        full_name = func.concat_ws(" ", Client.first_name, Client.last_name)
        statement = statement.where(
            or_(
                Client.first_name.ilike(pattern, escape="\\"),
                Client.last_name.ilike(pattern, escape="\\"),
                full_name.ilike(pattern, escape="\\"),
                Client.phone.ilike(pattern, escape="\\"),
            )
        )

    result = await db.execute(
        statement.order_by(
            func.lower(Client.first_name),
            func.lower(Client.last_name),
        )
    )
    return [_to_client_read(client) for client in result.scalars().all()]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_client(
    payload: ClientCreate,
    db: AsyncSession = Depends(get_db),
) -> ClientRead:
    """Register a client."""
    client = Client(**payload.model_dump())
    db.add(client)
    await db.commit()
    return _to_client_read(client)


@router.get("/{client_id}")
async def get_client(
    client_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> ClientDetailRead:
    """Return a client with itemized sales and total outstanding fiado."""
    result = await db.execute(
        select(Client)
        .where(Client.id == client_id)
        .options(
            selectinload(Client.sales)
            .selectinload(Sale.items)
            .selectinload(SaleItem.product)
        )
    )
    client = result.scalar_one_or_none()

    if client is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cliente não encontrado",
        )

    balance_result = await db.execute(
        select(
            func.coalesce(
                func.sum(FiadoAccount.remaining_balance),
                Decimal("0.00"),
            )
        )
        .select_from(FiadoAccount)
        .join(Sale, Sale.id == FiadoAccount.sale_id)
        .where(Sale.client_id == client.id)
    )
    outstanding_balance = balance_result.scalar_one()

    sales = sorted(
        client.sales,
        key=lambda sale: (sale.sale_date, sale.created_at),
        reverse=True,
    )

    return ClientDetailRead(
        **_to_client_read(client).model_dump(),
        sales_history=[
            ClientSaleRead(
                id=sale.id,
                sale_date=sale.sale_date,
                payment_method=sale.payment_method,
                total_amount=sale.total_amount,
                items=[
                    ClientSaleItemRead(
                        id=item.id,
                        product_id=item.product_id,
                        product_name=item.product.name,
                        quantity=item.quantity,
                        unit_sale_price=item.unit_sale_price,
                    )
                    for item in sale.items
                ],
            )
            for sale in sales
        ],
        outstanding_fiado_balance=outstanding_balance,
    )


@router.patch("/{client_id}")
async def update_client(
    client_id: UUID,
    payload: ClientUpdate,
    db: AsyncSession = Depends(get_db),
) -> ClientRead:
    """Partially update a client while protecting the walk-in identity."""
    client = await _get_client_or_404(db, client_id)
    changes = payload.model_dump(exclude_unset=True)

    if client.id == WALK_IN_CLIENT_ID and any(
        field in changes and changes[field] != getattr(client, field)
        for field in ("first_name", "last_name")
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="O nome do Cliente avulso não pode ser alterado.",
        )

    for field, value in changes.items():
        if value is not None or field in {"social_handle", "notes"}:
            setattr(client, field, value)

    await db.commit()
    return _to_client_read(client)


@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_client(
    client_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a client unless it is protected or owns sales history."""
    client = await _get_client_or_404(db, client_id)

    if client.id == WALK_IN_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="O Cliente avulso é necessário para vendas sem cadastro e não pode ser excluído.",
        )

    try:
        await db.delete(client)
        await db.commit()
    except IntegrityError as error:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Este cliente possui vendas registradas e não pode ser excluído.",
        ) from error
