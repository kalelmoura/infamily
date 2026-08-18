"""Pydantic schemas for client profiles and their purchase history."""

from datetime import date, datetime
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, StringConstraints, field_validator

from app.schemas.sale import PaymentMethod


RequiredText = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1),
]


class ClientCreate(BaseModel):
    """Fields accepted when registering a client."""

    model_config = ConfigDict(extra="forbid")

    first_name: RequiredText
    last_name: RequiredText
    phone: RequiredText
    social_handle: str | None = None
    notes: str | None = None

    @field_validator("social_handle", "notes", mode="before")
    @classmethod
    def normalize_optional_text(cls, value: object) -> object:
        """Store blank optional fields as NULL instead of empty text."""
        if isinstance(value, str):
            stripped = value.strip()
            return stripped or None
        return value


class ClientUpdate(BaseModel):
    """Fields accepted by the partial client update endpoint."""

    model_config = ConfigDict(extra="forbid")

    first_name: RequiredText | None = None
    last_name: RequiredText | None = None
    phone: RequiredText | None = None
    social_handle: str | None = None
    notes: str | None = None

    @field_validator("social_handle", "notes", mode="before")
    @classmethod
    def normalize_optional_text(cls, value: object) -> object:
        """Store blank optional fields as NULL instead of empty text."""
        if isinstance(value, str):
            stripped = value.strip()
            return stripped or None
        return value


class ClientRead(BaseModel):
    """One client profile returned by list and write endpoints."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    first_name: str
    last_name: str
    full_name: str
    phone: str
    social_handle: str | None
    notes: str | None
    is_walk_in: bool
    created_at: datetime
    updated_at: datetime


class ClientSaleItemRead(BaseModel):
    """One product line in a client's purchase history."""

    id: UUID
    product_id: UUID
    product_name: str
    quantity: int
    unit_sale_price: Decimal


class ClientSaleRead(BaseModel):
    """One sale in a client's purchase history."""

    id: UUID
    sale_date: date
    payment_method: PaymentMethod
    total_amount: Decimal
    items: list[ClientSaleItemRead]


class ClientDetailRead(ClientRead):
    """A client profile with purchases and the total debt still open."""

    sales_history: list[ClientSaleRead]
    outstanding_fiado_balance: Decimal
