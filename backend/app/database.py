"""Async database setup for the FastAPI backend.

This module owns everything about *talking to Postgres*:

  * `engine`            — the connection pool, created once for the whole app;
  * `AsyncSessionLocal` — a factory that hands out one session per request;
  * `Base`              — the declarative base every ORM model inherits from;
  * `get_db`            — a FastAPI dependency that yields a session and
                          guarantees it is closed when the request finishes.

Everything here is *async*: the engine uses the asyncpg driver, sessions are
`AsyncSession`, and queries are awaited. That lets one worker serve many
requests concurrently — while one request waits on the database, others keep
moving — instead of blocking a whole thread per request.
"""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.config import settings


# --- The engine ------------------------------------------------------------
# The engine holds the connection pool and knows how to speak to Postgres.
# It is created ONCE at import time and shared by the whole application:
# opening a database connection is expensive, so the pool keeps a handful of
# them open and lends them out as requests need them.
#
# `settings.database_url` must use the asyncpg driver, i.e. the scheme
# `postgresql+asyncpg://...` — that `+asyncpg` is what selects the async
# driver instead of the default (blocking) one.
engine = create_async_engine(
    settings.database_url,
    # Flip to True to echo every SQL statement to the log — handy while
    # learning, to see exactly what the ORM sends to Postgres.
    echo=False,
    # Before handing a pooled connection to a request, send a tiny "ping" to
    # check it is still alive. Supabase (and any network in between) drops
    # connections that have sat idle; without this you would get an occasional
    # "server closed the connection" error on the first query after an idle
    # spell. The ping costs almost nothing and removes that whole class of bug
    # — worth it for a long-running service like ours.
    pool_pre_ping=True,
)


# --- The session factory ---------------------------------------------------
# A *session* is one unit of work: it tracks the objects you load or add and
# batches the SQL that syncs them to the database. `async_sessionmaker` is a
# factory — calling `AsyncSessionLocal()` produces a fresh session bound to
# our engine. We build the factory once here and reuse it everywhere.
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    # By default SQLAlchemy *expires* every object right after `commit()`, so
    # the next attribute access silently fires a SELECT to reload it. In async
    # code that hidden query is a trap: it runs outside an `await` and can blow
    # up (or surprise you) after the request thinks it's done. Turning expiry
    # off keeps objects readable after commit — e.g. you can still return
    # `product.id` in the response without a second round-trip. This is the
    # single most important async-specific setting here.
    expire_on_commit=False,
)


# --- The declarative base --------------------------------------------------
# Every model (Product, Sale, ...) subclasses `Base`. SQLAlchemy gathers those
# subclasses into `Base.metadata`, the in-memory catalogue of our tables —
# which is what Alembic reads to autogenerate migrations, for example.
# `DeclarativeBase` is the SQLAlchemy 2.0 way; the old `declarative_base()`
# function is legacy.
class Base(DeclarativeBase):
    pass


# --- The per-request dependency --------------------------------------------
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Yield a database session for the duration of one request.

    Use it in an endpoint like:

        @router.get("/products")
        async def list_products(db: AsyncSession = Depends(get_db)):
            ...

    FastAPI runs the code up to the `yield` before your endpoint, injects the
    session, then runs the code after the `yield` once the response is sent.
    The `async with` block guarantees the session is closed (its connection
    returned to the pool) no matter what — normal return or exception.

    Note what this dependency deliberately does NOT do: it never commits. A
    session closed with uncommitted changes is rolled back, so if an endpoint
    raises, nothing is persisted. Committing is left to the endpoint/service,
    because *they* own the transaction boundary — which is exactly what a sale
    needs: stock deduction + sale + fiado must commit together or not at all.
    """
    async with AsyncSessionLocal() as session:
        yield session
