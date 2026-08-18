"""add clients and link sales

Revision ID: 4d7f2a9c6b31
Revises: 8ec834541983
Create Date: 2026-08-18

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "4d7f2a9c6b31"
down_revision: Union[str, Sequence[str], None] = "8ec834541983"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


WALK_IN_CLIENT_ID = "00000000-0000-0000-0000-000000000001"


def upgrade() -> None:
    """Replace free-text fiado names with clients linked through sales."""
    # Existing rows are test data. Clear the dependent tables first so the new
    # required sales.client_id column needs neither a nullable transition nor a
    # guessed backfill.
    op.execute(sa.text("DELETE FROM sale_items"))
    op.execute(sa.text("DELETE FROM fiado_accounts"))
    op.execute(sa.text("DELETE FROM sales"))

    op.create_table(
        "clients",
        sa.Column(
            "id",
            sa.UUID(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("first_name", sa.Text(), nullable=False),
        sa.Column("last_name", sa.Text(), nullable=False),
        sa.Column("phone", sa.Text(), nullable=False),
        sa.Column("social_handle", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # Keep the fixed value local to the migration so this historical operation
    # remains reproducible even if the application constant is reorganized.
    op.execute(
        sa.text(
            f"""
            INSERT INTO clients (
                id,
                first_name,
                last_name,
                phone,
                social_handle,
                notes
            ) VALUES (
                '{WALK_IN_CLIENT_ID}'::uuid,
                'Cliente',
                'avulso',
                'Não informado',
                NULL,
                NULL
            )
            """
        )
    )

    op.add_column("sales", sa.Column("client_id", sa.UUID(), nullable=False))
    op.create_foreign_key(
        "fk_sales_client_id_clients",
        "sales",
        "clients",
        ["client_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index("ix_sales_client_id", "sales", ["client_id"], unique=False)

    op.drop_column("fiado_accounts", "customer_name")

    # RLS is defense in depth. No public policy is added: the authenticated
    # FastAPI backend remains the only application path to client data.
    op.execute(sa.text("ALTER TABLE clients ENABLE ROW LEVEL SECURITY"))


def downgrade() -> None:
    """Restore the previous fiado name shape before removing clients."""
    op.add_column(
        "fiado_accounts",
        sa.Column("customer_name", sa.Text(), nullable=True),
    )

    # A downgrade may happen after real client-linked fiados have been created.
    # Preserve their names before removing the relationship the old schema
    # cannot represent.
    op.execute(
        sa.text(
            """
            UPDATE fiado_accounts
            SET customer_name = TRIM(
                CONCAT_WS(' ', clients.first_name, clients.last_name)
            )
            FROM sales
            JOIN clients ON clients.id = sales.client_id
            WHERE sales.id = fiado_accounts.sale_id
            """
        )
    )
    op.alter_column(
        "fiado_accounts",
        "customer_name",
        existing_type=sa.Text(),
        nullable=False,
    )

    op.drop_index("ix_sales_client_id", table_name="sales")
    op.drop_constraint(
        "fk_sales_client_id_clients",
        "sales",
        type_="foreignkey",
    )
    op.drop_column("sales", "client_id")
    op.drop_table("clients")
