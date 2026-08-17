"""Pydantic schemas for the dashboard response.

The dashboard is a read-only aggregate view. It does not introduce new domain
state; it only groups existing fiado accounts and products into the three
things Yasmin needs to see first after login.
"""

from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class DashboardOverdueFiadoRead(BaseModel):
    """One overdue fiado row shown at the top of the dashboard."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    customer_name: str
    next_due_date: date
    remaining_balance: Decimal
    days_overdue: int


class DashboardDueSoonFiadoRead(BaseModel):
    """One fiado due soon, using the same money/date fields as overdue rows."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    customer_name: str
    next_due_date: date
    remaining_balance: Decimal


class DashboardLowStockProductRead(BaseModel):
    """One product whose stock is low enough to need attention."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    stock_quantity: int


class DashboardRead(BaseModel):
    """The single payload returned by `GET /api/dashboard`."""

    overdue: list[DashboardOverdueFiadoRead]
    due_soon: list[DashboardDueSoonFiadoRead]
    low_stock: list[DashboardLowStockProductRead]
