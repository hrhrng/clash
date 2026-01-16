"""Session interrupt service for distributed interrupt flag management.

Provides functions to set and check interrupt flags stored in D1/SQLite,
enabling graceful session interruption across serverless instances.
"""

import asyncio
import logging
import time
from typing import Any, Literal

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, ToolMessage

from master_clash.database.checkpointer import get_async_checkpointer
from master_clash.database.di import get_database
from master_clash.json_utils import dumps as json_dumps
from master_clash.json_utils import loads as json_loads

logger = logging.getLogger(__name__)

SessionStatus = Literal["running", "completing", "interrupted", "completed"]


def _row_get(row: Any, key: str | int, default: Any = None) -> Any:
    """Fetch a value from DB row across adapters.

    Supports tuples/lists, dict-like rows, and sqlite3.Row (subscriptable by column name).
    """
    if isinstance(row, (list, tuple)):
        if isinstance(key, int) and 0 <= key < len(row):
            return row[key]
        return default

    getter = getattr(row, "get", None)
    if callable(getter):
        try:
            return getter(key, default)
        except TypeError:
            pass

    try:
        return row[key]
    except Exception:
        return default


async def create_session(thread_id: str, project_id: str, title: str | None = None) -> None:
    """Create or update a session record when starting a workflow.

    Args:
        thread_id: Unique session/thread identifier
        project_id: Project this session belongs to
        title: Optional initial title
    """
    db = get_database()
    try:
        db.execute(
            """
            INSERT INTO session_interrupts (thread_id, project_id, status, title, created_at, updated_at)
            VALUES (?, ?, 'running', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT(thread_id) DO UPDATE SET
                status = 'running',
                interrupted_at = NULL,
                updated_at = CURRENT_TIMESTAMP
            """,
            (thread_id, project_id, title),
        )
        db.commit()
        logger.info(
            f"[Session] Created/updated session: thread_id={thread_id}, project_id={project_id}, title={title}"
        )
    finally:
        db.close()


async def request_interrupt(thread_id: str) -> bool:
    """Request interruption of a session.

    Sets the status to 'completing' - the session will stop after current step.

    Args:
        thread_id: Session to interrupt

    Returns:
        True if session was found and updated, False if not found
    """
    db = get_database()
    try:
        db.execute(
            """
            UPDATE session_interrupts
            SET status = 'completing', interrupted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE thread_id = ? AND status = 'running'
            """,
            (thread_id,),
        )
        db.commit()

        # Check if update affected any rows
        rows = db.fetchall(
            "SELECT thread_id FROM session_interrupts WHERE thread_id = ? AND status = 'completing'",
            (thread_id,),
        )
        success = len(rows) > 0

        if success:
            logger.info(f"[Session] Interrupt requested: thread_id={thread_id}")
        else:
            logger.warning(
                f"[Session] Interrupt failed - session not found or not running: thread_id={thread_id}"
            )

        return success
    finally:
        db.close()


def check_interrupt_flag(thread_id: str) -> bool:
    """Check if a session should be interrupted (sync version for callbacks).

    Args:
        thread_id: Session to check

    Returns:
        True if session should stop (status is 'completing' or 'interrupted')
    """
    db = get_database()
    try:
        rows = db.fetchall(
            "SELECT status FROM session_interrupts WHERE thread_id = ? AND is_deleted = 0",
            (thread_id,),
        )
        if not rows:
            return False

        status = _row_get(rows[0], "status")
        if status is None:
            status = _row_get(rows[0], 0)
        should_interrupt = status in ("completing", "interrupted")

        if should_interrupt:
            logger.debug(
                f"[Session] Interrupt flag checked - TRUE: thread_id={thread_id}, status={status}"
            )

        return should_interrupt
    finally:
        db.close()


async def check_interrupt_flag_async(thread_id: str) -> bool:
    """Async version of interrupt flag check."""
    return check_interrupt_flag(thread_id)


async def set_session_status(thread_id: str, status: SessionStatus) -> None:
    """Update session status.

    Args:
        thread_id: Session to update
        status: New status
    """
    db = get_database()
    try:
        db.execute(
            "UPDATE session_interrupts SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE thread_id = ? AND is_deleted = 0",
            (status, thread_id),
        )
        db.commit()
        logger.info(f"[Session] Status updated: thread_id={thread_id}, status={status}")
    finally:
        db.close()


def get_session_status(thread_id: str) -> SessionStatus | None:
    """Get current session status.

    Args:
        thread_id: Session to check

    Returns:
        Session status or None if not found
    """
    db = get_database()
    try:
        rows = db.fetchall(
            "SELECT status FROM session_interrupts WHERE thread_id = ? AND is_deleted = 0",
            (thread_id,),
        )
        if not rows:
            return None
        status = _row_get(rows[0], "status")
        if status is None:
            status = _row_get(rows[0], 0)
        return status
    finally:
        db.close()


async def delete_session(thread_id: str) -> bool:
    """Delete a session and all its associated data.

    Removes the session from session_interrupts, session_events, and
    LangGraph checkpoints.

    Args:
        thread_id: Session ID to delete

    Returns:
        True if something was deleted, False otherwise
    """
    db = get_database()
    try:
        # Soft delete: update is_deleted and deleted_at
        db.execute(
            """
            UPDATE session_interrupts
            SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE thread_id = ?
            """,
            (thread_id,),
        )
        db.commit()
        logger.info(f"[Session] Soft deleted session: {thread_id}")
        return True
    except Exception as e:
        logger.error(f"[Session] Failed to soft delete session {thread_id}: {e}")
        return False
    finally:
        db.close()


class InterruptFlagCache:
    """Cache for interrupt flag with time-based refresh.

    Reduces database queries by caching the flag value and refreshing
    periodically (default: every 500ms).
    """

    def __init__(self, thread_id: str, refresh_interval_ms: int = 500):
        self.thread_id = thread_id
        self.refresh_interval = refresh_interval_ms / 1000.0
        self.last_check = 0.0
        self._cached_value = False

    def should_interrupt(self) -> bool:
        """Check if session should be interrupted (cached).

        Returns:
            True if session should stop
        """
        now = time.time()
        if now - self.last_check > self.refresh_interval:
            self._cached_value = check_interrupt_flag(self.thread_id)
            self.last_check = now
        return self._cached_value

    def force_refresh(self) -> bool:
        """Force refresh the cache and return current value."""
        self._cached_value = check_interrupt_flag(self.thread_id)
        self.last_check = time.time()
        return self._cached_value


async def _get_checkpoint_tuple(checkpointer: Any, config: dict[str, Any]):
    aget = getattr(checkpointer, "aget_tuple", None)
    if callable(aget):
        try:
            return await aget(config)
        except NotImplementedError:
            pass

    get_tuple = getattr(checkpointer, "get_tuple", None)
    if callable(get_tuple):
        return await asyncio.to_thread(get_tuple, config)

    return None


async def get_session_history(thread_id: str) -> list[dict[str, Any]]:
    """Retrieve structured message history for a session from LangGraph checkpoints.

    Maps LangGraph messages to ChatbotCopilot display items (message, thinking, tool_call, agent_card).

    Args:
        thread_id: Session identifier

    Returns:
        List of display items compatible with the frontend
    """
    logger.info(f"[SessionHistory] Fetching structured history for thread_id={thread_id}")

    checkpointer = await get_async_checkpointer()
    config = {"configurable": {"thread_id": thread_id}}

    checkpoint_tuple = await _get_checkpoint_tuple(checkpointer, config)
    if not checkpoint_tuple:
        logger.warning(f"[SessionHistory] No checkpoint found for thread_id={thread_id}")
        return []

    state = checkpoint_tuple.checkpoint.get("channel_values", {})
    messages = state.get("messages", [])

    if not messages:
        logger.info(f"[SessionHistory] No messages in state for thread_id={thread_id}")
        return []

    # First pass: collect tool outputs to resolve tool call status
    tool_outputs = {}
    for msg in messages:
        if isinstance(msg, ToolMessage):
            tool_outputs[msg.tool_call_id] = msg.content

    history = []

    def generate_id():
        import random
        import string
        import time

        return str(int(time.time() * 1000)) + "".join(
            random.choices(string.ascii_lowercase + string.digits, k=7)
        )

    for msg in messages:
        if not isinstance(msg, BaseMessage):
            continue

        if isinstance(msg, HumanMessage):
            history.append(
                {
                    "type": "message",
                    "role": "user",
                    "content": msg.content,
                    "id": msg.id or generate_id(),
                }
            )

        elif isinstance(msg, AIMessage):
            # 1. Handle Thinking (multi-part content)
            if isinstance(msg.content, list):
                for part in msg.content:
                    if isinstance(part, dict):
                        if part.get("type") == "thinking":
                            history.append(
                                {
                                    "type": "thinking",
                                    "content": part.get("thinking", ""),
                                    "id": generate_id(),
                                }
                            )
                        elif part.get("type") == "text":
                            history.append(
                                {
                                    "type": "message",
                                    "role": "assistant",
                                    "content": part.get("text", ""),
                                    "id": generate_id(),
                                }
                            )
            elif isinstance(msg.content, str) and msg.content:
                history.append(
                    {
                        "type": "message",
                        "role": "assistant",
                        "content": msg.content,
                        "id": msg.id or generate_id(),
                    }
                )

            # 2. Handle Tool Calls
            if hasattr(msg, "tool_calls") and msg.tool_calls:
                for tc in msg.tool_calls:
                    tool_name = tc.get("name")
                    tool_args = tc.get("args", {})
                    tc_id = tc.get("id")

                    # Special case: task_delegation -> agent_card
                    if tool_name == "task_delegation":
                        agent_name = tool_args.get("agent", "Specialist")
                        history.append(
                            {
                                "type": "agent_card",
                                "id": f"agent-{tc_id}",
                                "props": {
                                    "agentId": tc_id,
                                    "agentName": agent_name,
                                    "status": "completed" if tc_id in tool_outputs else "working",
                                    "persona": agent_name.lower(),
                                    "logs": [],  # We don't recurse into sub-agent history for now
                                },
                            }
                        )
                    else:
                        history.append(
                            {
                                "type": "tool_call",
                                "id": tc_id,
                                "props": {
                                    "toolName": tool_name,
                                    "args": tool_args,
                                    "status": "success" if tc_id in tool_outputs else "pending",
                                    "indent": False,
                                },
                            }
                        )

    logger.info(
        f"[SessionHistory] Generated {len(history)} display items for thread_id={thread_id}"
    )
    return history


def list_project_sessions(project_id: str) -> list[dict[str, Any]]:
    """List all session IDs and titles associated with a project.

    Args:
        project_id: Project identifier

    Returns:
        List of session objects {thread_id, title, updated_at}
    """
    db = get_database()
    try:
        rows = db.fetchall(
            "SELECT thread_id, title, updated_at FROM session_interrupts WHERE project_id = ? AND is_deleted = 0 ORDER BY updated_at DESC",
            (project_id,),
        )
        history = []
        for row in rows:
            if isinstance(row, (list, tuple)):
                history.append(
                    {
                        "thread_id": row[0],
                        "title": row[1] or f"Session {row[0][-6:]}",
                        "updated_at": row[2],
                    }
                )
            else:
                thread_id = _row_get(row, "thread_id")
                title = _row_get(row, "title")
                history.append(
                    {
                        "thread_id": thread_id,
                        "title": title
                        or (
                            f"Session {thread_id[-6:]}"
                            if isinstance(thread_id, str) and len(thread_id) >= 6
                            else "Session"
                        ),
                        "updated_at": _row_get(row, "updated_at"),
                    }
                )
        return history
    finally:
        db.close()


async def generate_and_update_title(thread_id: str, first_message: Any) -> str:
    """Generate a summary title for a session using LLM and update DB.

    Args:
        thread_id: Session ID
        first_message: The first user message to summarize

    Returns:
        The generated title
    """

    def _extract_text(content: Any) -> str:
        if content is None:
            return ""
        if isinstance(content, list):
            return "".join(
                part.get("text", "")
                for part in content
                if isinstance(part, dict) and "text" in part
            )
        return str(content)

    try:
        from master_clash.workflow.multi_agent import create_default_llm

        llm = create_default_llm()

        msg_text = _extract_text(first_message)
        prompt = f"Summarize the following user request into a very concise title (3-5 words max). No quotes or extra text.\n\nRequest: {msg_text}"

        response = await llm.ainvoke(prompt)
        content = response.content
        title_text = _extract_text(content).strip().strip('"').strip("'")

        # Fallback if empty
        if not title_text:
            title_text = f"Session {thread_id[-6:]}"

        db = get_database()
        try:
            db.execute(
                "UPDATE session_interrupts SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE thread_id = ?",
                (title_text, thread_id),
            )
            db.commit()
            logger.info(f"[Session] Title generated and saved: {title_text} for {thread_id}")
        finally:
            db.close()

        return title_text
    except Exception as e:
        logger.error(f"[Session] Failed to generate title: {e}")
        return f"Session {thread_id[-6:]}"


def log_session_event(thread_id: str, event_type: str, payload: dict[str, Any]) -> None:
    """Log a streaming event to the database for history replay.

    Args:
        thread_id: Session identifier
        event_type: Type of event (text, thinking, tool_start, etc.)
        payload: Event data
    """
    db = get_database()
    try:
        db.execute(
            "INSERT INTO session_events (thread_id, event_type, payload) VALUES (?, ?, ?)",
            (thread_id, event_type, json_dumps(payload)),
        )
        db.commit()
    except Exception as e:
        logger.error(f"[SessionEvent] Failed to log event {event_type} for {thread_id}: {e}")
    finally:
        db.close()


def get_session_events(thread_id: str) -> list[dict[str, Any]]:
    """Retrieve all logged events for a session.

    Args:
        thread_id: Session identifier

    Returns:
        List of event objects {event_type, payload, created_at}
    """
    db = get_database()
    try:
        rows = db.fetchall(
            "SELECT event_type, payload, created_at FROM session_events WHERE thread_id = ? ORDER BY created_at ASC",
            (thread_id,),
        )
        events = []
        for row in rows:
            if isinstance(row, (list, tuple)):
                etype, pay, crea = row
            else:
                etype = _row_get(row, "event_type")
                pay = _row_get(row, "payload")
                crea = _row_get(row, "created_at")

            try:
                events.append(
                    {
                        "event_type": etype,
                        "payload": json_loads(pay) if isinstance(pay, str) else pay,
                        "created_at": crea,
                    }
                )
            except Exception:
                continue
        return events
    finally:
        db.close()


async def get_session_history_from_events(thread_id: str) -> list[dict[str, Any]]:
    """Reconstruct session history by replaying logged stream events.

    This provides high fidelity history including partial thinking, logs, and UI state
    that LangGraph checkpoints might not fully capture.
    """
    events = get_session_events(thread_id)
    if not events:
        # Fallback to checkpoint-based history
        return await get_session_history(thread_id)

    display_items = []

    # Track current active block for incremental updates
    # This mimics the frontend's logic
    for event in events:
        etype = event["event_type"]
        data = event["payload"]

        if etype == "user_message":
            display_items.append(
                {
                    "id": f"user-{int(time.time() * 1000)}-{len(display_items)}",
                    "type": "message",
                    "role": "user",
                    "content": data.get("content", ""),
                }
            )

        elif etype == "text":
            content = data.get("content", "")
            agent = data.get("agent", "Director")
            agent_id = data.get("agent_id")

            # Find or create a message item
            last_item = display_items[-1] if display_items else None
            if (
                last_item
                and last_item["type"] == "message"
                and last_item.get("role") == "assistant"
                and last_item.get("agent_id") == agent_id
            ):
                last_item["content"] += content
            else:
                display_items.append(
                    {
                        "id": f"msg-{int(time.time() * 1000)}-{len(display_items)}",
                        "type": "message",
                        "role": "assistant",
                        "agent": agent,
                        "agent_id": agent_id,
                        "content": content,
                    }
                )

        elif etype == "thinking":
            content = data.get("content", "")
            agent = data.get("agent")
            agent_id = data.get("agent_id")

            last_item = display_items[-1] if display_items else None
            if (
                last_item
                and last_item["type"] == "thinking"
                and last_item.get("agent_id") == agent_id
            ):
                last_item["content"] += content
            else:
                display_items.append(
                    {
                        "id": f"think-{int(time.time() * 1000)}-{len(display_items)}",
                        "type": "thinking",
                        "agent": agent,
                        "agent_id": agent_id,
                        "content": content,
                    }
                )

        elif etype == "tool_start":
            display_items.append(
                {
                    "id": data.get("id"),
                    "type": "agent_card" if data.get("tool") == "task_delegation" else "tool_call",
                    "props": {
                        "agentId": data.get("id")
                        if data.get("tool") == "task_delegation"
                        else None,
                        "agentName": data.get("input", {}).get("agent", "Specialist")
                        if data.get("tool") == "task_delegation"
                        else None,
                        "toolName": data.get("tool"),
                        "args": data.get("input"),
                        "status": "working",
                        "logs": [],
                    },
                }
            )

        elif etype == "tool_end":
            item_id = data.get("id")
            for item in display_items:
                if item.get("id") == item_id or item.get("props", {}).get("agentId") == item_id:
                    item["props"]["status"] = data.get("status", "success")
                    item["props"]["result"] = data.get("result")
                    break

        # ... Other event types can be added here (timeline_edit, etc.)

    return display_items
