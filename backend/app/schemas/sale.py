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

from pydantic import BaseModel, ConfigDict, Field, model_validator

# A fiado sale carries its terms in the same body, so the sale schema needs the
# fiado one. The dependency runs in this direction only — `schemas/fiado.py`
# never imports from here, which is what keeps the two modules from forming a
# circular import.
from app.schemas.fiado import FiadoTermsCreate

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

    client_id: UUID
    sale_date: date
    payment_method: PaymentMethod

    # `min_length=1` on a list means "at least one element". A sale with no
    # items would produce a zero-total row that deducts no stock — meaningless,
    # so it is rejected as a validation error rather than handled downstream.
    items: Annotated[list[SaleItemCreate], Field(min_length=1)]

    # The credit terms, present only on a fiado sale. Optional in the type
    # system, but not optional in practice — the validator below ties it to
    # `payment_method`. This nesting is the unified model from spec section 2
    # made concrete: one request records the sale, deducts the stock and opens
    # the debt, so there is no window in which the goods have left the store
    # and nothing is tracking that they were not paid for.
    fiado: FiadoTermsCreate | None = None

    @model_validator(mode="after")
    def check_fiado_terms_match_payment_method(self) -> "SaleCreate":
        """The terms must be present for a fiado sale, and absent otherwise.

        A field-level validator cannot express this: it sees one field at a
        time, and this rule is about the relationship between two. `mode=
        "after"` runs once every field has been parsed, so both are available.

        Both directions are rejected, not just the missing one. Terms sent with
        `payment_method: "pix"` mean the caller believes it is recording a
        credit sale while the server is about to record a paid one — silently
        dropping them would leave a debt nobody is tracking. Failing loudly is
        the only safe reading of an ambiguous request.
        """
        if self.payment_method is PaymentMethod.FIADO and self.fiado is None:
            raise ValueError(
                "Informe os dados do fiado (frequência, número de "
                "parcelas e data combinada)."
            )

        if self.payment_method is not PaymentMethod.FIADO and self.fiado is not None:
            raise ValueError(
                "Dados de fiado só podem ser enviados quando a forma de "
                "pagamento é fiado."
            )

        # A settlement date before the sale itself is not a schedule, it is a
        # typo — and it would open the fiado already overdue.
        if self.fiado is not None and self.fiado.agreed_settlement_date < self.sale_date:
            raise ValueError(
                "A data combinada não pode ser anterior à data da venda."
            )

        return self


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
    client_id: UUID
    client_name: str
    sale_date: date
    payment_method: PaymentMethod
    total_amount: Decimal
    total_cost: Decimal
    created_at: datetime
    items: list[SaleItemRead]
