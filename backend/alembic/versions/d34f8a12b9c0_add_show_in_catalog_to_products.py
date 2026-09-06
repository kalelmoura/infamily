"""add show_in_catalog to products

Revision ID: d34f8a12b9c0
Revises: a1c5e93b7d20
Create Date: 2026-09-06 12:00:00.000000

Catalogue visibility is an explicit owner choice. Existing products start
hidden, so deploying this migration cannot accidentally publish inventory.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d34f8a12b9c0"
down_revision: str | Sequence[str] | None = "a1c5e93b7d20"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "products",
        sa.Column(
            "show_in_catalog",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("products", "show_in_catalog")
