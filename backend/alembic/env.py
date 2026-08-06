import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

# Our application. `prepend_sys_path = .` in alembic.ini puts the backend/
# directory on sys.path, which is what makes these imports work when you run
# the `alembic` command from backend/.
#
# Importing `app.models` is not decorative: a model class only registers
# itself in Base.metadata when its module is imported. Without this line
# Base.metadata would be empty and autogenerate would cheerfully decide our
# whole schema should be deleted.
import app.models  # noqa: F401  (imported for its side effect: registering models)
from app.config import settings
from app.database import Base

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# The schema Alembic compares the live database against when autogenerating.
# `Base.metadata` is the in-memory catalogue of every table our models define.
target_metadata = Base.metadata


def get_url() -> str:
    """The database URL, read from our pydantic-settings Settings.

    Deliberately NOT from alembic.ini: that file is committed to git and the
    URL contains the database password. Settings reads it from the
    environment (or the gitignored .env), so the secret stays out of the repo
    and Alembic uses the exact same connection string as the running app.
    """
    return settings.database_url


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """In this scenario we need to create an Engine
    and associate a connection with the context.

    """

    # Take the settings block from alembic.ini, then inject our URL over the
    # top of it. Setting the key in this plain dict (rather than writing it
    # back into the .ini config) also sidesteps configparser's `%`
    # interpolation, which would otherwise choke on a password containing `%`.
    configuration = config.get_section(config.config_ini_section, {})
    configuration["sqlalchemy.url"] = get_url()

    # NullPool: a migration run is a short-lived one-shot process, so there is
    # no point keeping a pool of connections warm the way the API server does.
    connectable = async_engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""

    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
