"""Sale creation — the one piece of real business logic in the system so far.

This lives in a service, not in the router, for the reason set out in
`routers/products.py`: products are straight CRUD and belong in the router, but
recording a sale means validating stock, deducting it, snapshotting prices,
computing totals and — for a credit sale — opening the fiado account, rules that
have nothing to do with HTTP.

Nothing in this module imports FastAPI. It raises `SaleError` with a message
already written in Portuguese, and the router decides that means 400. That
separation is the point of the layer: the rules could be called from a script,
a background job or a test with no web server anywhere in sight.

**The whole function is one transaction.** `get_db` never commits; the single
`await db.commit()` at the very end is the only place anything is persisted. Any
exception before it — a validation failure, a lost connection, a bug — leaves
the session with uncommitted changes, and closing it rolls everything back. Stock
is never decremented "halfway", and a fiado sale can never leave the store with
the stock gone and no record of the debt.
"""

from collections import defaultdict
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product import Product
from app.models.sale import Sale, SaleItem
from app.schemas.sale import SaleCreate
from app.services.fiado import build_fiado_account


class SaleError(Exception):
    """A sale that cannot be recorded, with a message safe to show the user.

    One class for every rejection reason (unknown product, insufficient stock)
    because they all mean the same thing to the caller:
    the request described a sale that cannot happen, and the message says why.
    Splitting it into a hierarchy would buy nothing while there is exactly one
    handler.
    """


async def create_sale(db: AsyncSession, payload: SaleCreate) -> Sale:
    """Record a sale atomically, deducting stock. Returns the persisted `Sale`.

    Raises `SaleError` if the sale is not possible, having written nothing.
    """
    # --- Aggregate the requested quantity per product ----------------------
    # The same product may legitimately appear on two lines — say two units at
    # full price and one discounted. Validating each line on its own would then
    # be wrong: against a stock of 4, lines of 3 and 2 units each pass the check
    # individually while together they oversell by 1. Summing first is what
    # makes the check correct.
    requested_quantities: dict[UUID, int] = defaultdict(int)
    for item in payload.items:
        requested_quantities[item.product_id] += item.quantity

    # --- Lock the product rows --------------------------------------------
    # `with_for_update()` emits `SELECT ... FOR UPDATE`, taking a row-level
    # exclusive lock on each product for the rest of this transaction. This is
    # what makes two simultaneous sales of the last unit safe:
    #
    #   * sale B blocks here until sale A commits or rolls back;
    #   * when B resumes, Postgres (in READ COMMITTED) re-reads the row at its
    #     newly committed version, so B's stock check below sees the stock A
    #     already deducted — not the value B would have read a moment earlier.
    #
    # That re-read is the crux. Without the lock, both transactions would read
    # "1 in stock", both would pass validation, and both would write "0" — the
    # classic lost update, and one unit sold twice.
    #
    # `order_by(Product.id)` is not cosmetic: it fixes a single global order in
    # which every sale acquires its locks. Two sales touching products X and Y
    # in opposite orders would otherwise deadlock, each holding what the other
    # waits for. Postgres puts the LockRows step above the Sort in the plan, so
    # rows are locked in the sorted order.
    #
    # The lock costs nothing extra: we have to SELECT these products anyway, to
    # read `cost_price` for the snapshot.
    result = await db.execute(
        select(Product)
        .where(Product.id.in_(requested_quantities.keys()))
        .order_by(Product.id)
        .with_for_update()
    )
    products_by_id = {product.id: product for product in result.scalars().all()}

    # --- Validate everything BEFORE changing anything ----------------------
    # Two passes on purpose. A single pass that deducted as it went would leave
    # the first lines deducted when line three turns out to be short. The
    # transaction would roll those back, so the database would survive it — but
    # the code would be relying on rollback to paper over a logic error, and
    # would report the failure only after doing work it should never have
    # started.
    missing_ids = requested_quantities.keys() - products_by_id.keys()
    if missing_ids:
        raise SaleError(
            "Um dos produtos da venda não foi encontrado. Atualize a página e tente novamente."
        )

    for product_id, quantity in requested_quantities.items():
        product = products_by_id[product_id]
        if product.stock_quantity < quantity:
            raise SaleError(
                f'Estoque insuficiente para "{product.name}": '
                f"{product.stock_quantity} em estoque, {quantity} solicitada(s)."
            )

    # --- Build the sale ----------------------------------------------------
    sale = Sale(
        sale_date=payload.sale_date,
        # `PaymentMethod` is a StrEnum, so its members *are* strings — this goes
        # into the TEXT column as "dinheiro"/"pix"/"cartao" with no conversion.
        payment_method=payload.payment_method,
        # Real values assigned below, once the items are priced. The columns are
        # NOT NULL, so they need *something* now.
        total_amount=Decimal("0"),
        total_cost=Decimal("0"),
    )

    total_amount = Decimal("0")
    total_cost = Decimal("0")

    for item in payload.items:
        product = products_by_id[item.product_id]

        # The snapshot. `unit_sale_price` honours a per-line discount when the
        # client sent one, and otherwise freezes the product's current listed
        # price. `unit_cost_price` always comes from the product — what she paid
        # is a fact about the item, never a client input.
        unit_sale_price = (
            item.unit_sale_price
            if item.unit_sale_price is not None
            else product.sale_price
        )
        unit_cost_price = product.cost_price

        # Deduct stock on the locked row. SQLAlchemy tracks the change and emits
        # the UPDATE at flush time, inside this transaction.
        product.stock_quantity -= item.quantity

        # Decimal arithmetic throughout — never float. Decimal × int is exact,
        # and both operands already carry at most two decimal places, so the
        # running totals stay within NUMERIC(10, 2) without any rounding step.
        total_amount += unit_sale_price * item.quantity
        total_cost += unit_cost_price * item.quantity

        sale.items.append(
            SaleItem(
                # Assigning the *relationship* rather than `product_id` lets the
                # response read `item.product.name` without a query — which
                # matters because `lazy="raise"` would otherwise reject the
                # access. SQLAlchemy fills in `product_id` on flush.
                product=product,
                quantity=item.quantity,
                unit_sale_price=unit_sale_price,
                unit_cost_price=unit_cost_price,
            )
        )

    sale.total_amount = total_amount
    sale.total_cost = total_cost

    # `add` stages the sale; the cascade on `Sale.items` stages the line items
    # with it. Still no SQL.
    db.add(sale)

    # --- The fiado record --------------------------------------------------
    # Only for a credit sale. `payload.fiado` is guaranteed to be present
    # exactly when `payment_method` is fiado — the schema's model validator
    # enforces both halves of that, so there is no need to re-check the method
    # here; the presence of the terms *is* the condition.
    #
    # This is the reason the whole function is one transaction. The balance is
    # computed from `total_amount`, the figure the server just derived from
    # products it holds row locks on — never from anything the client sent.
    if payload.fiado is not None:
        # Staged explicitly rather than through a cascade: `FiadoAccount.sale`
        # is a one-directional many-to-one (no `Sale.fiado` collection to
        # cascade from). Because the relationship is set, SQLAlchemy still
        # INSERTs the sale first and fills `sale_id` with the id Postgres
        # generated for it.
        db.add(build_fiado_account(sale, payload.fiado))

    # The one and only commit. Everything above — the stock decrements, the
    # sale, its items, and the fiado account if there is one — becomes durable
    # here, together, or not at all. The row locks taken by FOR UPDATE are
    # released at this point, letting any sale blocked behind us proceed against
    # the stock we just wrote.
    await db.commit()

    return sale
