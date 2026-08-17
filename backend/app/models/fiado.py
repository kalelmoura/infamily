"""The `FiadoAccount` model — the debt left behind by a credit sale.

Maps the `fiado_accounts` table from the spec (section 5). The unifying idea
from section 2 is what makes this table so small: **a fiado is not a second kind
of sale**. The items taken, the totals and the stock deduction all live on the
`sales`/`sale_items` rows already; this table only adds what a credit sale needs
*extra* — who owes, on what terms, and how much is still open.

That is why there is no `items` here and no `total_amount`: both are one join
away through `sale_id`, and copying them would create two numbers that can
disagree.

Three things are load-bearing:

  * **`sale_id` is UNIQUE.** The relationship is one-to-one: a sale has at most
    one fiado. Enforcing it in the database (not just in our code) is what makes
    "two fiado records for the same sale" structurally impossible.
  * **`remaining_balance` is the only mutable money figure**, and it has a CHECK
    that keeps it at or above zero. The payment logic clamps to zero; the
    constraint is what guarantees the invariant even if that logic were wrong.
  * **Status is NOT a column.** Whether a fiado is overdue depends on today's
    date, so a stored status would be silently wrong the morning after it was
    written. It is derived at read time — see `app/services/fiado.py`.
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
from app.models.sale import Sale


class FiadoAccount(Base):
    __tablename__ = "fiado_accounts"

    # `UPDATE ... RETURNING`, for the same reason as on `Product`: recording a
    # payment updates this row, and `updated_at` is computed by Postgres, so
    # without this it would be left expired and the response would try to
    # lazy-load it — which async code cannot do. See models/product.py for the
    # full explanation.
    __mapper_args__ = {"eager_defaults": True}

    __table_args__ = (
        # Same TEXT + CHECK choice as `sales.payment_method`, for the same
        # reason: widening a CHECK is a one-line constraint swap, while adding a
        # value to a native Postgres ENUM is an awkward migration. These are
        # domain codes; the frontend renders "Semanal"/"Quinzenal"/"Mensal".
        CheckConstraint(
            "frequency IN ('weekly', 'biweekly', 'monthly')",
            name="ck_fiado_accounts_frequency_valid",
        ),
        # Zero installments would make the installment amount a division by
        # zero; a negative count is meaningless.
        CheckConstraint(
            "installments_count > 0",
            name="ck_fiado_accounts_installments_count_positive",
        ),
        CheckConstraint(
            "installment_amount >= 0",
            name="ck_fiado_accounts_installment_amount_non_negative",
        ),
        # The invariant that matters most in this table. A negative balance
        # would mean the store owes the customer money, which this system has no
        # concept of — and it would poison the "to receive" figure in the
        # financial summary, which is a plain SUM over this column.
        CheckConstraint(
            "remaining_balance >= 0",
            name="ck_fiado_accounts_remaining_balance_non_negative",
        ),
    )

    # Server-generated, like every other id in the schema: Postgres owns id
    # generation, so any writer gets a valid one without remembering to set it.
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )

    # ON DELETE CASCADE, like `sale_items.sale_id`: the debt cannot outlive the
    # sale that created it. `unique=True` is what makes this a *one-to-one* —
    # without it the FK alone would allow many fiado rows per sale.
    sale_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sales.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )

    # Free text, not a FK to a `customers` table. The MVP deliberately has no
    # customer entity (spec section 15): this list *is* the store's client view.
    customer_name: Mapped[str] = mapped_column(Text, nullable=False)

    frequency: Mapped[str] = mapped_column(Text, nullable=False)
    installments_count: Mapped[int] = mapped_column(Integer, nullable=False)

    # Computed once, at sale time, from the sale total and the installment
    # count, then frozen. Storing it (rather than recomputing on read) means the
    # agreed instalment never shifts under the customer's feet — and the payment
    # endpoint has an unambiguous amount to subtract.
    installment_amount: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False
    )

    # The date agreed with the customer, kept as a fixed reference: it records
    # what was promised and never moves.
    agreed_settlement_date: Mapped[date] = mapped_column(Date, nullable=False)

    # The working date: starts equal to `agreed_settlement_date` and advances by
    # the frequency each time an installment is paid. This is the field the
    # overdue check compares against today.
    next_due_date: Mapped[date] = mapped_column(Date, nullable=False)

    # Starts at the sale's `total_amount` and only ever goes down.
    remaining_balance: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # --- Relationship ------------------------------------------------------
    # The link back to the sale, which is where the items taken actually live —
    # the fiado detail screen reads them through here.
    #
    # It is also what lets `services/sales.py` build a FiadoAccount for a Sale
    # that has not been INSERTed yet: assigning `sale=<the new Sale>` makes
    # SQLAlchemy order the two INSERTs correctly and fill `sale_id` in from the
    # id Postgres just generated, with no manual flush in between.
    #
    # Deliberately one-directional (no `Sale.fiado` collection), the same call
    # as `SaleItem.product`: nothing needs to navigate sale → fiado, and not
    # declaring the reverse side keeps the Sale mapper — and the sale-recording
    # path — exactly as it was.
    #
    # `lazy="raise"` for the usual async reason: an accidental lazy load inside
    # async code surfaces as a baffling `MissingGreenlet` far from the mistake,
    # while `raise` says plainly that a `selectinload()` is missing.
    sale: Mapped[Sale] = relationship(lazy="raise")
