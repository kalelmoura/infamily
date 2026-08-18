"""ORM models package.

Importing every model here matters more than it looks. A model class only
registers itself in `Base.metadata` when its module is *imported* — nothing
scans the folder for you. So if `app.models.product` is never imported,
`Base.metadata` comes back empty and Alembic's autogenerate would happily
produce a migration that drops nothing and creates nothing.

Re-exporting the models from this one place means a single
`import app.models` (which `alembic/env.py` will do) is enough to make the
whole schema visible. Add every new model to this file as it is created.
"""

from app.models.client import Client
from app.models.fiado import FiadoAccount
from app.models.product import Product
from app.models.sale import Sale, SaleItem

__all__ = ["Client", "FiadoAccount", "Product", "Sale", "SaleItem"]
