import sqlite3


def _make_sqlite_rows():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute(
        """
        CREATE TABLE session_interrupts (
            thread_id TEXT,
            title TEXT,
            updated_at TEXT,
            project_id TEXT,
            is_deleted INTEGER
        )
        """
    )
    conn.execute(
        """
        INSERT INTO session_interrupts (thread_id, title, updated_at, project_id, is_deleted)
        VALUES ('thread_abcdef123456', NULL, '2026-01-01T00:00:00', 'proj1', 0)
        """
    )
    rows = conn.execute(
        """
        SELECT thread_id, title, updated_at
        FROM session_interrupts
        WHERE project_id = ? AND is_deleted = 0
        ORDER BY updated_at DESC
        """,
        ("proj1",),
    ).fetchall()
    conn.close()
    return rows


def test_list_project_sessions_accepts_sqlite_row(monkeypatch):
    from master_clash.services import session_interrupt

    class FakeDB:
        def __init__(self, rows):
            self._rows = rows

        def fetchall(self, _sql, _params):
            return self._rows

        def close(self):
            return None

    monkeypatch.setattr(session_interrupt, "get_database", lambda: FakeDB(_make_sqlite_rows()))
    sessions = session_interrupt.list_project_sessions("proj1")

    assert sessions[0]["thread_id"] == "thread_abcdef123456"
    assert sessions[0]["title"] == "Session 123456"
    assert sessions[0]["updated_at"] == "2026-01-01T00:00:00"
