"""Simple SQL migrations runner (SQLite/Postgres).

Keeps a `schema_migrations` table with applied versions and executes
ordered SQL files from `migrations/{dialect}`.
"""

from __future__ import annotations

import contextlib
from importlib.resources import files

from master_clash.database.ports import Database


def _ensure_migrations_table(db: Database, create_stmt: str) -> None:
    db.execute(create_stmt)
    db.commit()


def _list_migrations(package: str) -> list[str]:
    resources = files(package)
    names = [e.name for e in resources.iterdir() if e.name.endswith(".sql")]
    names.sort()
    return names


def _read_migration(package: str, name: str) -> str:
    return (files(package) / name).read_text(encoding="utf-8")


def _exec_sql_script(db: Database, sql: str) -> None:
    # naive split by ';' that are statement terminators; skip empty
    statements = [s.strip() for s in sql.split(";")]
    for stmt in statements:
        if stmt:
            db.execute(stmt)


def run_migrations(db: Database, dialect: str) -> list[str]:
    """Apply pending migrations for a dialect.

    Args:
        db: Database adapter
        dialect: "sqlite" or "postgres"

    Returns:
        List of applied migration filenames
    """
    if dialect == "sqlite":
        create_stmt = (
            "CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY)"
        )
        package = "master_clash.migrations.sqlite"
    elif dialect == "postgres":
        create_stmt = (
            "CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY)"
        )
        package = "master_clash.migrations.postgres"
    else:
        raise ValueError(f"Unsupported dialect: {dialect}")

    _ensure_migrations_table(db, create_stmt)

    # Get applied versions
    rows = db.fetchall("SELECT version FROM schema_migrations")
    # rows may be sequences or dict-like depending on adapter
    applied = set()
    for row in rows:
        if isinstance(row, (list, tuple)):
            applied.add(row[0])
        elif isinstance(row, dict):
            applied.add(row.get("version"))
        else:
            with contextlib.suppress(Exception):
                applied.add(row[0])

    applied_now: list[str] = []
    for name in _list_migrations(package):
        if name in applied:
            continue
        sql = _read_migration(package, name)
        _exec_sql_script(db, sql)
        db.execute("INSERT INTO schema_migrations(version) VALUES (?)", (name,))
        db.commit()
        applied_now.append(name)

    return applied_now
