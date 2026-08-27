"""enable rls on remaining tables

Revision ID: ff9554b0d5f0
Revises: 4d7f2a9c6b31
Create Date: 2026-08-27 20:32:33.344643

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ff9554b0d5f0'
down_revision: Union[str, Sequence[str], None] = '4d7f2a9c6b31'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLES = ["products", "sales", "sale_items", "fiado_accounts"]


def upgrade() -> None:
    # Defense in depth. No policies on purpose: the FastAPI backend
    # connects as table owner and bypasses RLS, so deny-all blocks the
    # publishable key while the app keeps working.
    for table in TABLES:
        op.execute(sa.text(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY"))


def downgrade() -> None:
    for table in TABLES:
        op.execute(sa.text(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY"))
