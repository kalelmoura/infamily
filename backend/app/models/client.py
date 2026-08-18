"""The `Client` model — one person or household that buys from the store.

Every sale points to a client, including immediate sales. This makes purchase
history a property of the sale itself and removes the duplicated free-text
name that previously lived only on fiado accounts.

The special walk-in row ("Cliente avulso") uses the fixed id from
`app.constants`. It behaves like an ordinary foreign-key target in Postgres;
the API layer is responsible for preventing its deletion or renaming.
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.constants import WALK_IN_CLIENT_ID
from app.database import Base

if TYPE_CHECKING:
    from app.models.sale import Sale


class Client(Base):
    __tablename__ = "clients"

    # Fetch the database-computed `updated_at` value as part of an UPDATE so it
    # remains readable after a commit in the async session.
    __mapper_args__ = {"eager_defaults": True}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )

    first_name: Mapped[str] = mapped_column(Text, nullable=False)
    last_name: Mapped[str] = mapped_column(Text, nullable=False)
    phone: Mapped[str] = mapped_column(Text, nullable=False)
    social_handle: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # No ORM delete cascade: sales are historical records and the database's
    # ON DELETE RESTRICT must be the authority. `passive_deletes=True` prevents
    # SQLAlchemy from trying to null the required FK before Postgres can reject
    # the client deletion with the intended foreign-key violation.
    sales: Mapped[list["Sale"]] = relationship(
        back_populates="client",
        lazy="raise",
        passive_deletes=True,
    )

    @property
    def full_name(self) -> str:
        """The display name used by API responses."""
        return f"{self.first_name} {self.last_name}".strip()

    @property
    def is_walk_in(self) -> bool:
        """Whether this is the protected default client."""
        return self.id == WALK_IN_CLIENT_ID
