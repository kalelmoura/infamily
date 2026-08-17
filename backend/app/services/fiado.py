"""Fiado rules — installment maths, due-date advance, and derived status.

Everything in this module is about the two questions the fiado module has to
answer correctly: *how much is each installment* and *when is the next one due*.
Both are easy to get subtly wrong, and both are wrong in ways that only show up
weeks later, so they live here — pure functions with no HTTP and no session,
callable from the sale-recording transaction, from the payment endpoint, and
from a test.

The one piece of state-changing logic, `apply_installment_payment`, mutates a
`FiadoAccount` in place and deliberately does *not* commit: the caller owns the
transaction boundary, exactly as in `services/sales.py`.
"""

from datetime import date, datetime
from decimal import ROUND_CEILING, Decimal
from zoneinfo import ZoneInfo

from dateutil.relativedelta import relativedelta

from app.models.fiado import FiadoAccount
from app.models.sale import Sale
from app.schemas.fiado import FiadoStatus, FiadoTermsCreate, Frequency


class FiadoError(Exception):
    """A fiado operation that cannot happen, with a message safe to show.

    Same shape and reasoning as `SaleError`: one class, one handler, a message
    already written in Portuguese for Yasmin.
    """


# The store's timezone. "Today" for an overdue check is today *in São Paulo*,
# not in UTC — the server may well run in another zone, and between 21:00 and
# midnight local time UTC has already rolled over to tomorrow. Comparing a
# UTC-derived date against `next_due_date` would then mark a debt overdue a few
# hours early, every single evening.
STORE_TIMEZONE = ZoneInfo("America/Sao_Paulo")

# How many days ahead counts as "a vencer" (due soon). The spec suggests 7.
DUE_SOON_DAYS = 7

# What "advance by one installment" means for each frequency.
#
# `relativedelta` rather than `timedelta` is the whole point for the monthly
# case: `timedelta(days=30)` is not a month, and a due date of 31 January would
# land on 2 March. `relativedelta(months=1)` gives 28 February (29 in a leap
# year) — it clamps to the last valid day of the target month, which is what a
# person means by "same day next month".
#
# Weekly and biweekly are plain day arithmetic, but they are expressed the same
# way so the lookup below has one uniform type.
FREQUENCY_STEPS: dict[Frequency, relativedelta] = {
    Frequency.WEEKLY: relativedelta(weeks=1),
    Frequency.BIWEEKLY: relativedelta(weeks=2),
    Frequency.MONTHLY: relativedelta(months=1),
}


def today_in_store() -> date:
    """Today's date in the store's timezone."""
    return datetime.now(STORE_TIMEZONE).date()


def compute_installment_amount(total: Decimal, installments_count: int) -> Decimal:
    """Split `total` into `installments_count` parts, as one per-installment value.

    Rounded **up** to two decimals, and that direction is a decision, not a
    detail. The spec's rule is "the last installment absorbs the difference, so
    the installments sum to the total", and only rounding up satisfies it.

    Take R$ 100,00 in 3×. Rounding to nearest gives 33,33 — three payments clear
    99,99 and leave a one-cent debt, so the customer owes a fourth installment
    of R$ 0,01 and the schedule she agreed to is a lie. Rounding up gives 33,34:
    two payments of 33,34 leave 33,32, and the third clears the balance exactly
    (the payment logic clamps at zero). Three payments, correct total, and the
    difference lands on the last one — which is exactly the rule.

    Working in `Decimal` throughout keeps this exact; `quantize` is what forces
    the result into the two decimal places NUMERIC(10, 2) stores.
    """
    return (total / installments_count).quantize(
        Decimal("0.01"), rounding=ROUND_CEILING
    )


def advance_due_date(current: date, frequency: Frequency) -> date:
    """The next due date after `current`, one installment later."""
    return current + FREQUENCY_STEPS[frequency]


def derive_status(
    next_due_date: date, remaining_balance: Decimal, today: date
) -> FiadoStatus:
    """Classify a fiado as of `today` (spec section 5).

    `today` is passed in rather than read here so that one listing classifies
    every row against the same date — a request that happened to straddle
    midnight would otherwise compare its first and last rows to different days.
    It also makes the function trivially testable.

    Order matters: a paid-off fiado is never "overdue", however old its last due
    date is, so the balance check comes first.
    """
    if remaining_balance <= 0:
        return FiadoStatus.PAID_OFF
    if next_due_date < today:
        return FiadoStatus.OVERDUE
    if (next_due_date - today).days <= DUE_SOON_DAYS:
        return FiadoStatus.DUE_SOON
    return FiadoStatus.CURRENT


# Sort order for the collection list: what needs chasing comes first, settled
# debts sink to the bottom. Yasmin opens this screen to find out who to call.
STATUS_ORDER: dict[FiadoStatus, int] = {
    FiadoStatus.OVERDUE: 0,
    FiadoStatus.DUE_SOON: 1,
    FiadoStatus.CURRENT: 2,
    FiadoStatus.PAID_OFF: 3,
}


def build_fiado_account(sale: Sale, terms: FiadoTermsCreate) -> FiadoAccount:
    """Build the fiado record for a credit sale, ready to be persisted.

    Called from inside the sale transaction, with `sale` still pending (not yet
    INSERTed). Assigning the relationship instead of `sale_id` is what makes
    that work: SQLAlchemy orders the two INSERTs and fills the FK in from the id
    Postgres generates for the sale.

    Nothing here is taken from the client except the terms — the balance and the
    installment amount are computed from the sale total the server just
    calculated from real stock.
    """
    return FiadoAccount(
        sale=sale,
        customer_name=terms.customer_name,
        # `Frequency` is a StrEnum, so this goes into the TEXT column as
        # "weekly"/"biweekly"/"monthly" with no conversion.
        frequency=terms.frequency,
        installments_count=terms.installments_count,
        installment_amount=compute_installment_amount(
            sale.total_amount, terms.installments_count
        ),
        agreed_settlement_date=terms.agreed_settlement_date,
        # The first installment falls due on the date agreed. From then on this
        # field moves and `agreed_settlement_date` does not.
        next_due_date=terms.agreed_settlement_date,
        # The debt starts as the whole sale — nothing has been paid yet.
        remaining_balance=sale.total_amount,
    )


def apply_installment_payment(fiado: FiadoAccount) -> None:
    """Record one installment as paid, mutating `fiado` in place.

    Two rules, both from the spec's gotchas:

      * **The balance never goes negative.** The last installment is normally
        smaller than the rest (see `compute_installment_amount`), so subtracting
        the full amount would overshoot. Clamping at zero is what makes that
        final payment settle the debt exactly.
      * **The date does not advance after payoff.** A settled fiado has no next
        installment, so leaving `next_due_date` where it is keeps a quitado row
        from drifting into the future forever.

    Does not commit. The caller does, once.
    """
    if fiado.remaining_balance <= 0:
        raise FiadoError("Este fiado já está quitado.")

    remaining = fiado.remaining_balance - fiado.installment_amount
    # `max` against a Decimal zero, not 0.0: mixing Decimal and float is exactly
    # the kind of thing that reintroduces binary rounding into money.
    fiado.remaining_balance = max(remaining, Decimal("0.00"))

    if fiado.remaining_balance > 0:
        # Advance from the due date, not from today: the schedule is a fixed
        # cadence agreed with the customer, so paying three days late does not
        # push every future installment three days later.
        #
        # A known consequence of storing only `next_due_date`: a monthly
        # schedule starting 31 January becomes 28 February and then 28 March,
        # because the next step is computed from the clamped date rather than
        # from the original day-of-month. Recovering the "31st" would mean
        # storing how many installments have been paid and recomputing from
        # `agreed_settlement_date` each time. The MVP takes the simpler field.
        fiado.next_due_date = advance_due_date(
            fiado.next_due_date, Frequency(fiado.frequency)
        )
