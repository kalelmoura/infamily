"""add photo_path to products

Revision ID: a1c5e93b7d20
Revises: ff9554b0d5f0
Create Date: 2026-09-03 10:12:04.881205

Phase 8 — product photos. One optional photo per product, stored in a Supabase
Storage bucket; this column holds the object's path inside that bucket.

Note there is deliberately no migration creating the bucket itself. Buckets
live in the `storage` schema, owned by the `supabase_storage_admin` role, so a
migration touching them would fail on any database where that schema or role is
absent (a plain local Postgres, for instance). The bucket is a one-time manual
step documented in README.md.

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1c5e93b7d20'
down_revision: Union[str, Sequence[str], None] = 'ff9554b0d5f0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Nullable, with no default: every product already in the table has no
    # photo, and adding a NOT NULL column to a populated table would need a
    # backfill value that has no meaning here. NULL *is* the meaning — "this
    # piece has no photo yet".
    op.add_column(
        "products",
        sa.Column("photo_path", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    # Dropping the column loses the paths, but the objects themselves stay in
    # the bucket — a downgrade must not reach out and delete files.
    op.drop_column("products", "photo_path")
