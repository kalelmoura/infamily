"""Pydantic schemas for products — the API's *contract*, not its storage.

Two different jobs, two different kinds of class:

  * the ORM model (`app/models/product.py`) describes the **table**;
  * the schemas here describe the **JSON going in and out** of the API.

Keeping them separate is what stops internal fields from leaking into
responses and stops clients from writing fields they have no business writing
(ids, timestamps). Pydantic validates every incoming payload *before* the
endpoint body runs — a bad request never reaches the database.

Three schemas, one per direction of traffic:

  * `ProductCreate` — POST body: everything required to make a product;
  * `ProductUpdate` — PATCH body: the same fields, all optional;
  * `ProductRead`   — what we send back, including the server-generated fields.
"""

from datetime import datetime
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

# --- Reusable field types --------------------------------------------------
# `Annotated[X, ...]` attaches validation rules to a type, so the rule travels
# with the type instead of being repeated on every field. Declaring them once
# here guarantees ProductCreate and ProductUpdate validate *identically* — if
# the rules were written out twice, they would eventually drift apart.
#
# It also solves a practical problem for the optional (PATCH) fields: writing
# `Decimal | None = Field(ge=0)` is ambiguous about which side of the union the
# constraint applies to, while `Money | None` obviously constrains the Decimal
# and leaves `None` alone.

# `strip_whitespace=True` runs BEFORE the length check, so a name of "   "
# becomes "" and is then rejected by `min_length=1`. Without the strip, a
# whitespace-only name would sail through. Bonus: names are stored trimmed, so
# "Camiseta " and "Camiseta" can't coexist as two different products.
ProductName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]

# Money mirrors the column exactly: NUMERIC(10, 2). `max_digits`/`decimal_places`
# are not paranoia — they turn what would be a Postgres numeric-overflow error
# (a 500, after the round-trip) into a clean 422 validation error, and they stop
# a value like 10.999 from being silently rounded on the way into the table.
# `ge=0` is the API-level half of the "prices are never negative" rule; the
# CHECK constraint in the table is the other half. Both, on purpose: validation
# gives a good error message, the constraint guarantees the invariant.
Money = Annotated[Decimal, Field(ge=0, max_digits=10, decimal_places=2)]

# Stock is a whole number of units, never negative.
StockQuantity = Annotated[int, Field(ge=0)]


class ProductCreate(BaseModel):
    """Body of `POST /api/products`."""

    # `extra="forbid"` rejects any field we did not declare. This is what keeps
    # `id`, `created_at` and `updated_at` out of the caller's reach: they are
    # not declared here, so sending them is a 422.
    #
    # Pydantic's default (`extra="ignore"`) would already drop them silently,
    # which is safe but unhelpful — a client sending `{"sale_pirce": 50}` would
    # get a confusing "sale_price is required" instead of "sale_pirce is not a
    # field". Forbidding makes both the attack and the typo loud.
    model_config = ConfigDict(extra="forbid")

    name: ProductName
    cost_price: Money
    sale_price: Money
    # The only field with a default: creating an item you haven't received yet
    # is legitimate, so stock starts at zero rather than being required.
    stock_quantity: StockQuantity = 0


class ProductUpdate(BaseModel):
    """Body of `PATCH /api/products/{id}` — a *partial* update.

    Every field is optional because PATCH means "change only what I sent".
    Fields the client omits must be left untouched, which is why the router
    uses `model_dump(exclude_unset=True)`: that is the only way to tell
    "absent from the JSON" apart from "sent with its default value".
    """

    model_config = ConfigDict(extra="forbid")

    name: ProductName | None = None
    cost_price: Money | None = None
    sale_price: Money | None = None
    stock_quantity: StockQuantity | None = None


class ProductRead(BaseModel):
    """What the API returns for a product — the shape the frontend can rely on.

    Every endpoint converts to this schema before responding (never a raw ORM
    object): the response then contains exactly these fields, whatever
    else the model may grow later.
    """

    # `from_attributes=True` lets `ProductRead.model_validate(product)` read a
    # SQLAlchemy object — Pydantic pulls values from *attributes* instead of
    # expecting a dict. Without it, that call raises.
    model_config = ConfigDict(from_attributes=True)

    # Plain types here, not the constrained aliases above: this is an output
    # contract describing data that already exists and was validated on the way
    # in. Re-checking DB values on the way out only creates a way for a read to
    # fail. Constraints belong on input.
    id: UUID
    name: str
    cost_price: Decimal
    sale_price: Decimal
    stock_quantity: int
    sold_quantity: int = 0
    # The photo's public URL, or None for a product without one.
    #
    # Note what is *not* here: `photo_path`, the column the database actually
    # holds. The path is an internal storage detail — the frontend has no use
    # for it and no business knowing the bucket's layout. The router turns one
    # into the other (see `_to_read`), which is also why this field has a
    # default: `model_validate(product)` cannot find a `photo_url` attribute on
    # the ORM object, so it is filled in afterwards.
    #
    # It is absent from ProductCreate and ProductUpdate for a stronger reason:
    # those declare `extra="forbid"`, so a client trying to point a product at
    # an arbitrary URL gets a 422. Photos change only through the dedicated
    # upload endpoint, which controls what actually gets stored.
    photo_url: str | None = None
    created_at: datetime
    updated_at: datetime
