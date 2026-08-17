"""Pydantic schemas for the financial summary response."""

from decimal import Decimal

from pydantic import BaseModel


class SummaryRead(BaseModel):
    """The five figures shown on the Resumo page."""

    total_sold: Decimal
    total_cost: Decimal
    total_profit: Decimal
    received: Decimal
    to_receive: Decimal
