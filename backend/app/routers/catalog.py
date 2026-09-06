"""Public, read-only catalogue for the landing page.

The authenticated products API contains private operational fields such as
cost and exact stock. This separate route is intentionally unauthenticated and
returns a dedicated, minimal schema so those fields cannot leak by accident.
"""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.product import Product
from app.schemas.product import CatalogProductRead
from app.services.storage import build_public_url

router = APIRouter(prefix="/api/catalog", tags=["catalog"])


@router.get("")
async def list_catalog_products(
    db: AsyncSession = Depends(get_db),
) -> list[CatalogProductRead]:
    """Return only owner-selected products that clients can currently buy."""
    result = await db.execute(
        select(Product)
        .where(
            Product.show_in_catalog.is_(True),
            Product.stock_quantity > 0,
            Product.photo_path.is_not(None),
        )
        .order_by(Product.updated_at.desc(), Product.name)
    )

    catalogue: list[CatalogProductRead] = []
    for product in result.scalars().all():
        if product.photo_path is None:
            continue

        photo_url = build_public_url(product.photo_path)
        # Storage configuration is optional at app startup. If it is absent,
        # omit the item instead of handing the public page a broken image URL.
        if not photo_url:
            continue

        catalogue.append(
            CatalogProductRead(
                id=product.id,
                name=product.name,
                sale_price=product.sale_price,
                photo_url=photo_url,
            )
        )

    return catalogue
