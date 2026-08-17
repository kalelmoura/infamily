"""Pydantic schemas for sales — the API's contract for recording and reading them.

Same split as `schemas/product.py`: the ORM models describe the tables, these
classes describe the JSON crossing the wire.

The interesting part here is what a caller is *not* allowed to send. A sale's
`total_amount`, `total_cost` and every item's `unit_cost_price` are decided by
the server from the products actually in stock — a client that could set them
could book a sale at any profit it liked. They are simply not declared on the
Create schemas below, and `extra="forbid"` turns sending one into a 422 rather
than silently ignoring it.
"""

from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

# Reused rather than restated: `Money` is `Decimal` constrained to NUMERIC(10, 2)
# with `ge=0`. The reasoning in schemas/product.py applies here too — two copies
# of a validation rule eventually drift apart, and money rules are the last place
# you want that.
from app.schemas.product import Money


class PaymentMethod(StrEnum):
    """How the sale was paid, matching the CHECK constraint on `sales`.

    `StrEnum` members *are* strings, so the value can be compared to and stored
    as plain text with no conversion. Declaring it as an enum (rather than a
    bare `str`) means FastAPI publishes the four valid values in the OpenAPI
    schema, so an invalid method is a 422 with a helpful message instead of a
    constraint violation deep in Postgres.

    These are domain codes, not UI text: the frontend maps them to the labels
    Yasmin sees.
    """

    DINHEIRO = "dinheiro"
    PIX = "pix"
    CARTAO = "cartao"
    FIADO = "fiado"


class SaleItemCreate(BaseModel):
    """One line of the sale being recorded."""

    model_config = ConfigDict(extra="forbid")

    product_id: UUID
    # `gt=0` rejects zero and negative quantities at the edge, matching the
    # table's CHECK. Selling "0 units" is a mistake worth catching, not a no-op.
    quantity: Annotated[int, Field(gt=0)]

    # The discount hook. Omitted (the normal case) means "charge the product's
    # current listed price" — resolved server-side, so the client never has to
    # know the price to record a sale. Sent explicitly, it overrides the listed
    # price for this line only, which is how Yasmin gives a discount.
    #
    # Note this is the ONLY price a caller may set. `unit_cost_price` is always
    # taken from the product: what she paid is a fact, not an input.
    unit_sale_price: Money | None = None


class SaleCreate(BaseModel):
    """Body of `POST /api/sales`."""

    model_config = ConfigDict(extra="forbid")

    sale_date: date
    payment_method: PaymentMethod

    # `min_length=1` on a list means "at least one element". A sale with no
    # items would produce a zero-total row that deducts no stock — meaningless,
    # so it is rejected as a validation error rather than handled downstream.
    items: Annotated[list[SaleItemCreate], Field(min_length=1)]


class SaleItemRead(BaseModel):
    """One line of a recorded sale, as returned by the API."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    product_id: UUID
    # Included so a sales list can render "3 × Camiseta branca" without the
    # frontend fetching every product to resolve names. Read live from the
    # product (not snapshotted) — see the note in models/sale.py.
    product_name: str
    quantity: int
    unit_sale_price: Decimal
    unit_cost_price: Decimal


class SaleRead(BaseModel):
    """A recorded sale with its line items."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    sale_date: date
    payment_method: PaymentMethod
    total_amount: Decimal
    total_cost: Decimal
    created_at: datetime
    items: list[SaleItemRead]
