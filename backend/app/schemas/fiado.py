"""Pydantic schemas for fiado — the API contract for credit sales and collection.

Same split as everywhere else: `models/fiado.py` describes the table, these
classes describe the JSON.

Two things are worth reading closely.

**What a caller may set is a short list.** Creating a fiado means sending the
*terms* only — how often, in how many installments, and by when. The client is
selected on the sale itself. The three
numbers that matter financially (`installment_amount`, `next_due_date`,
`remaining_balance`) are all derived server-side from the sale total and those
terms. A client that could set `remaining_balance` could write off a debt with a
request, so it simply is not a field here.

**There is no `FiadoCreate`.** A fiado is never created on its own — it is part
of recording a sale, so `FiadoTermsCreate` is nested inside `SaleCreate` and
`POST /api/sales` is the only way in. That is the spec's unified model (section
2) expressed in the schemas: one event, one endpoint, one transaction.

Note the import direction: `schemas/sale.py` imports *from here*, never the
other way round. That is why `FiadoDetailItemRead` is declared below instead of
reusing `SaleItemRead` — a mutual import between the two modules would be a
circular import, and this schema wants a slightly different shape anyway (see
its docstring).
"""

from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class Frequency(StrEnum):
    """How often an installment falls due, matching the CHECK on the table.

    `StrEnum` members *are* strings, so a member goes straight into the TEXT
    column with no conversion. Declaring the enum (rather than a bare `str`)
    publishes the three valid values in the OpenAPI schema, so a typo is a 422
    with a helpful message instead of a constraint violation inside Postgres.

    Domain codes, not UI text: the frontend renders "Semanal", "Quinzenal" and
    "Mensal".
    """

    WEEKLY = "weekly"
    BIWEEKLY = "biweekly"
    MONTHLY = "monthly"


class FiadoStatus(StrEnum):
    """The derived state of a fiado, computed at read time — never stored.

    Whether a debt is overdue depends on what day it is, so a stored status
    would be wrong the morning after it was written. See
    `app/services/fiado.py` for the rules and `docs/SPEC.md` section 5 for the
    definitions.
    """

    OVERDUE = "overdue"
    DUE_SOON = "due_soon"
    CURRENT = "current"
    PAID_OFF = "paid_off"


class FiadoTermsCreate(BaseModel):
    """The fiado terms, sent nested inside the body of `POST /api/sales`.

    Required when `payment_method` is `fiado`, forbidden otherwise — that rule
    lives on `SaleCreate`, because it is the only place that can see both
    fields at once.
    """

    model_config = ConfigDict(extra="forbid")

    frequency: Frequency

    # `gt=0` mirrors the table's CHECK. Zero would be a division by zero when
    # computing the installment amount.
    installments_count: Annotated[int, Field(gt=0)]

    # The date agreed with the customer. It seeds `next_due_date` and is then
    # kept as a fixed record of what was promised.
    agreed_settlement_date: date


class FiadoRead(BaseModel):
    """The shared fiado summary: terms, balance, and derived status."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    sale_id: UUID
    client_id: UUID
    client_name: str
    frequency: Frequency
    installments_count: int
    installment_amount: Decimal
    agreed_settlement_date: date
    next_due_date: date
    remaining_balance: Decimal

    # The one field with no column behind it. It is computed per request from
    # `next_due_date` and `remaining_balance` against today in São Paulo, which
    # is why the routers build this schema by hand instead of calling
    # `model_validate(fiado)`.
    status: FiadoStatus

    created_at: datetime
    updated_at: datetime


class FiadoListRead(FiadoRead):
    """A collection-list row with the product names needed for local search."""

    product_names: list[str]


class FiadoDetailItemRead(BaseModel):
    """One line of the sale that created the fiado — "what this person took".

    Close to `SaleItemRead` but not the same schema, on purpose. Beyond avoiding
    a circular import between the two schema modules, this view answers a
    customer-facing question, so it carries the customer-facing numbers: what
    was taken, how many, at what price. `unit_cost_price` — what Yasmin paid the
    supplier — belongs to the profit calculation, not to a collection screen.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    product_id: UUID
    product_name: str
    quantity: int
    unit_sale_price: Decimal


class FiadoDetailRead(FiadoRead):
    """A fiado plus the sale it came from — the body of `GET /api/fiado/{id}`.

    Inherits every field of `FiadoRead` and adds the sale's context, so the
    detail screen can show the debt *and* what was taken for it without a second
    request.
    """

    sale_date: date

    # The original sale total. Together with `remaining_balance` it gives the
    # amount already paid, which is what the screen shows as progress. Read from
    # the sale rather than duplicated onto `fiado_accounts` — one number, one
    # home, no way for the two to disagree.
    sale_total: Decimal

    items: list[FiadoDetailItemRead]
