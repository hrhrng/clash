"""Interrupt middleware for graceful session interruption.

Provides multi-level interrupt checking:
- before_model: Check before each LLM call
- before_tool: Check before each tool execution
- token-level: Via callback injection, check during streaming

All interrupt flags are stored in the configured database (Postgres/SQLite) for cross-instance access.
"""

import logging
from typing import Any, Callable

from langchain.agents.middleware.types import (
    AgentMiddleware,
    ModelRequest,
    ModelResponse,
)
from langchain_core.callbacks.base import BaseCallbackHandler

from master_clash.services.session_interrupt import (
    InterruptFlagCache,
    check_interrupt_flag_async,
)

logger = logging.getLogger(__name__)


class InterruptRequested(Exception):
    """Raised when a session interruption has been requested."""
    
    def __init__(self, thread_id: str, message: str = "User requested interruption"):
        self.thread_id = thread_id
        self.message = message
        super().__init__(f"{message}: thread_id={thread_id}")


class InterruptCallbackHandler(BaseCallbackHandler):
    """Callback handler for token-level interrupt checking.

    Uses cached flag checks to minimize database queries while still
    providing responsive interruption during streaming.
    """

    def __init__(self, thread_id: str, check_interval_ms: int = 500):
        """Initialize callback handler.

        Args:
            thread_id: Session identifier
            check_interval_ms: How often to check DB for interrupt flag (default 500ms)
        """
        super().__init__()
        self.thread_id = thread_id
        self.cache = InterruptFlagCache(thread_id, check_interval_ms)
    
    def on_llm_new_token(self, token: str, **kwargs: Any) -> None:
        """Called for each new token during streaming.
        
        Checks the cached interrupt flag and raises if interruption requested.
        """
        if self.cache.should_interrupt():
            logger.info(f"[InterruptCallback] Token-level interrupt triggered: thread_id={self.thread_id}")
            raise InterruptRequested(self.thread_id, "Interrupted during token streaming")
    
    def on_llm_start(self, serialized: dict, prompts: list[str], **kwargs: Any) -> None:
        """Called when LLM starts - force refresh cache."""
        self.cache.force_refresh()
        if self.cache.should_interrupt():
            logger.info(f"[InterruptCallback] LLM start interrupt: thread_id={self.thread_id}")
            raise InterruptRequested(self.thread_id, "Interrupted before LLM start")
    
    def on_tool_start(self, serialized: dict, input_str: str, **kwargs: Any) -> None:
        """Called when tool starts - check interrupt flag."""
        if self.cache.force_refresh():
            logger.info(f"[InterruptCallback] Tool start interrupt: thread_id={self.thread_id}")
            raise InterruptRequested(self.thread_id, "Interrupted before tool execution")


class InterruptMiddleware(AgentMiddleware):
    """Middleware for multi-level interrupt checking.

    Provides three levels of interrupt checking:
    1. before_model (awrap_model_call): Check before each LLM call
    2. before_tool (awrap_tool_call): Check before each tool execution
    3. token-level: Via injected callback handler

    All flags are stored in the database for cross-instance access in serverless.
    """
    
    def __init__(self, thread_id: str, check_interval_ms: int = 500):
        """Initialize interrupt middleware.
        
        Args:
            thread_id: Session identifier
            check_interval_ms: Interval for token-level cache refresh
        """
        self.thread_id = thread_id
        self.callback = InterruptCallbackHandler(thread_id, check_interval_ms)
    
    def wrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], ModelResponse],
    ) -> ModelResponse:
        """Sync version - check interrupt before model call."""
        from master_clash.services.session_interrupt import check_interrupt_flag
        
        if check_interrupt_flag(self.thread_id):
            logger.info(f"[InterruptMiddleware] Model call blocked: thread_id={self.thread_id}")
            raise InterruptRequested(self.thread_id, "Interrupted before model call")
        
        # Inject callback for token-level interrupt
        request = self._inject_callback(request)
        return handler(request)
    
    async def awrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], ModelResponse],
    ) -> ModelResponse:
        """Async version - check interrupt before model call."""
        if await check_interrupt_flag_async(self.thread_id):
            logger.info(f"[InterruptMiddleware] Model call blocked (async): thread_id={self.thread_id}")
            raise InterruptRequested(self.thread_id, "Interrupted before model call")
        
        # Inject callback for token-level interrupt
        request = self._inject_callback(request)
        return await handler(request)
    
    def wrap_tool_call(
        self,
        request: Any,
        handler: Callable[[Any], Any],
    ) -> Any:
        """Sync version - check interrupt before tool execution."""
        from master_clash.services.session_interrupt import check_interrupt_flag
        
        if check_interrupt_flag(self.thread_id):
            logger.info(f"[InterruptMiddleware] Tool call blocked: thread_id={self.thread_id}")
            raise InterruptRequested(self.thread_id, "Interrupted before tool execution")
        
        return handler(request)
    
    async def awrap_tool_call(
        self,
        request: Any,
        handler: Callable[[Any], Any],
    ) -> Any:
        """Async version - check interrupt before tool execution."""
        if await check_interrupt_flag_async(self.thread_id):
            logger.info(f"[InterruptMiddleware] Tool call blocked (async): thread_id={self.thread_id}")
            raise InterruptRequested(self.thread_id, "Interrupted before tool execution")
        
        return await handler(request)
    
    def _inject_callback(self, request: ModelRequest) -> ModelRequest:
        """Inject the interrupt callback handler into the request.
        
        This enables token-level interrupt checking during streaming.
        """
        # Get existing callbacks or create empty list
        callbacks = list(getattr(request, 'callbacks', []) or [])
        
        # Add our interrupt callback if not already present
        if self.callback not in callbacks:
            callbacks.append(self.callback)
        
        # Return request with updated callbacks
        # Note: The exact method depends on ModelRequest implementation
        if hasattr(request, 'with_callbacks'):
            return request.with_callbacks(callbacks)
        elif hasattr(request, 'callbacks'):
            # Direct assignment if mutable
            request.callbacks = callbacks
            return request
        else:
            # Log warning if we can't inject
            logger.warning("[InterruptMiddleware] Could not inject callback - ModelRequest has no callbacks support")
            return request
