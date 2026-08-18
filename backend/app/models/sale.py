"""The `Sale` and `SaleItem` models — one recorded sale and its line items.

Maps the `sales` and `sale_items` tables from the spec (section 5). Every item
that leaves the store is a sale, whether it was paid immediately or taken on
fiado — that single idea is what keeps stock, history and profit consistent.

Three things here are load-bearing and easy to get wrong:

  * **Prices are snapshotted onto the line item.** `unit_sale_price` and
    `unit_cost_price` record what the item sold for *at that moment*. If Yasmin
    later re-prices a product, last month's sales and last month's profit must
    not move. This is why the columns exist at all instead of joining back to
    `products` at read time.
  * **The foreign keys have deliberately different delete behaviour.** Deleting
    a sale should take its line items with it (CASCADE) — they have no meaning
    on their own. Deleting a *product* that has ever been sold must be refused
    (RESTRICT), because that would erase history.
  * **Every sale belongs to a client.** Immediate sales use either a registered
    client or the protected walk-in client; fiado sales require a real client.
    The client FK is RESTRICT so purchase history cannot be orphaned.
"""

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.client import Client
from app.models.product import Product


class Sale(Base):
    __tablename__ = "sales"

    __table_args__ = (
        # The allowed payment methods, enforced by Postgres. The spec models
        # this as TEXT + CHECK rather than a native ENUM type on purpose: adding
        # a value to a Postgres ENUM is a schema migration with its own
        # awkwardness, while widening a CHECK is a one-line constraint swap.
        # The values are domain codes, not UI labels — the frontend translates
        # them for display.
        CheckConstraint(
            "payment_method IN ('dinheiro', 'pix', 'cartao', 'fiado')",
            name="ck_sales_payment_method_valid",
        ),
        CheckConstraint(
            "total_amount >= 0", name="ck_sales_total_amount_non_negative"
        ),
        CheckConstraint("total_cost >= 0", name="ck_sales_total_cost_non_negative"),
    )

    # Same server-generated UUID as `products`: Postgres owns id generation, so
    # every writer gets a valid id without our app having to remember to set one.
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )

    # ON DELETE RESTRICT keeps a client with purchase history from being
    # removed. There is deliberately no database default: the sale API must
    # make the client choice explicit, even though the UI defaults immediate
    # sales to the seeded walk-in client.
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clients.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    # A DATE, not a timestamp: the business fact is "which day did this sale
    # happen", and the owner may record yesterday's sale this morning. Keeping
    # it date-only also sidesteps a timezone question the summary would
    # otherwise have to answer on every query.
    sale_date: Mapped[date] = mapped_column(Date, nullable=False)

    payment_method: Mapped[str] = mapped_column(Text, nullable=False)

    # Denormalized totals: the sum of the items at sale price, and at cost.
    # Storing them (rather than summing `sale_items` on every read) is a
    # deliberate call from the spec — the financial summary stays fast, and the
    # numbers stay frozen even if a line item were ever corrected.
    total_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    total_cost: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # --- Relationships -----------------------------------------------------
    client: Mapped[Client] = relationship(
        back_populates="sales",
        lazy="raise",
    )

    # The Python-side link to the line items. This is ORM convenience, not a
    # database column — the actual link is the `sale_id` FK on the other table.
    #
    # `cascade="all, delete-orphan"`: deleting a Sale through the ORM deletes
    # its items, and removing an item from this list deletes that row. It is the
    # Python mirror of the ON DELETE CASCADE below; both exist because either
    # layer might be the one doing the deleting.
    #
    # `lazy="raise"` is the important one under asyncio. By default, touching an
    # unloaded relationship fires a lazy SELECT — which, in async code, raises a
    # baffling `MissingGreenlet` far from the real mistake. `raise` makes it fail
    # immediately with "this relationship was not loaded", pointing straight at
    # the missing `selectinload()`. Building a fresh Sale in Python is
    # unaffected: a brand-new object's collection starts empty, no load needed.
    items: Mapped[list["SaleItem"]] = relationship(
        back_populates="sale",
        cascade="all, delete-orphan",
        lazy="raise",
    )


class SaleItem(Base):
    __tablename__ = "sale_items"

    __table_args__ = (
        # Zero or negative units sold is meaningless, and a negative quantity
        # would *increase* stock through the sale path.
        CheckConstraint("quantity > 0", name="ck_sale_items_quantity_positive"),
        CheckConstraint(
            "unit_sale_price >= 0", name="ck_sale_items_unit_sale_price_non_negative"
        ),
        CheckConstraint(
            "unit_cost_price >= 0", name="ck_sale_items_unit_cost_price_non_negative"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )

    # ON DELETE CASCADE: a line item cannot outlive its sale. `ondelete` writes
    # the rule into the database itself, so it holds even for a raw SQL DELETE
    # that never goes through SQLAlchemy.
    sale_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sales.id", ondelete="CASCADE"),
        nullable=False,
    )

    # ON DELETE RESTRICT: Postgres refuses to delete a product that any sale
    # references. This is the spec's "deletion blocked if it has sales history"
    # rule, enforced where it cannot be bypassed. The API turns the resulting
    # error into a friendly 409 (see routers/products.py) — but even if it
    # forgot to, history would still be safe.
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="RESTRICT"),
        nullable=False,
    )

    quantity: Mapped[int] = mapped_column(Integer, nullable=False)

    # The price snapshot. `unit_sale_price` is what this item actually sold for
    # (which may be below the product's listed price, if Yasmin gave a
    # discount); `unit_cost_price` is what it had cost her. Profit for this line
    # is (unit_sale_price - unit_cost_price) * quantity, computable forever from
    # these two numbers alone.
    unit_sale_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    unit_cost_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    # --- Relationships -----------------------------------------------------
    sale: Mapped["Sale"] = relationship(back_populates="items", lazy="raise")

    # Many-to-one link to the product, used to read `product.name` for
    # responses. Deliberately one-directional: no matching `Product.sales`
    # collection, because nothing needs it and adding one would give SQLAlchemy
    # a chance to try cascading deletes from the product side — exactly what the
    # RESTRICT above is there to prevent.
    #
    # Note the product's *name* is not snapshotted, only its prices. Renaming a
    # product therefore updates how past sales read, which is what you want:
    # a typo fix should apply everywhere. Prices are the thing history must
    # freeze.
    product: Mapped[Product] = relationship(lazy="raise")
