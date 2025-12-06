"""Multi-agent LangGraph workflow for the creative canvas.

This module creates a supervisor agent with four specialized sub-agents,
following the deepagents architecture pattern.
"""

import asyncio
from functools import partial
from typing import Any, AsyncIterator, Optional

from langchain_core.callbacks import AsyncCallbackManagerForLLMRun
from langchain_core.messages import BaseMessage
from langchain_core.outputs import ChatGenerationChunk, ChatResult
from langchain_google_genai import ChatGoogleGenerativeAI

from master_clash.config import get_settings
from master_clash.workflow.backends import StateCanvasBackend
from master_clash.workflow.graph import create_supervisor_agent
from master_clash.workflow.middleware import (
    CanvasMiddleware,
    TimelineMiddleware,
    TodoListMiddleware,
)
from master_clash.workflow.subagents import create_specialist_agents



class AsyncChatGoogleGenerativeAI(ChatGoogleGenerativeAI):
    """Async wrapper to support REST transport and streaming."""

    async def _agenerate(
        self,
        messages: list[BaseMessage],
        stop: Optional[list[str]] = None,
        run_manager: Optional[AsyncCallbackManagerForLLMRun] = None,
        **kwargs: Any,
    ) -> ChatResult:
        # Run sync generation in a thread to work with REST transport
        return await asyncio.get_running_loop().run_in_executor(
            None,
            partial(self._generate, messages, stop=stop, run_manager=run_manager, **kwargs),
        )

    async def _astream(
        self,
        messages: list[BaseMessage],
        stop: Optional[list[str]] = None,
        run_manager: Optional[AsyncCallbackManagerForLLMRun] = None,
        **kwargs: Any,
    ) -> AsyncIterator[ChatGenerationChunk]:
        """Stream chunks with controlled pacing to avoid flooding the client."""
        queue: asyncio.Queue[ChatGenerationChunk | Exception | None] = asyncio.Queue()
        loop = asyncio.get_running_loop()

        def producer():
            import time
            try:
                chunk_count = 0
                for chunk in self._stream(messages, stop=stop, run_manager=None, **kwargs):
                    chunk_count += 1
                    content_preview = str(chunk.content)[:100] if hasattr(chunk, 'content') else str(chunk)[:100]
                    print(f"[{time.time():.3f}] Producer received chunk #{chunk_count}: {content_preview}")
                    loop.call_soon_threadsafe(queue.put_nowait, chunk)
                print(f"[{time.time():.3f}] Producer finished, total chunks: {chunk_count}")
                loop.call_soon_threadsafe(queue.put_nowait, None)
            except Exception as e:  # pragma: no cover - surface to async consumer
                loop.call_soon_threadsafe(queue.put_nowait, e)

        loop.run_in_executor(None, producer)

        import time
        chunk_yield_count = 0
        while True:
            item = await queue.get()
            if item is None:
                break
            if isinstance(item, Exception):
                raise item
            chunk_yield_count += 1
            content_preview = str(item.content)[:100] if hasattr(item, 'content') else str(item)[:100]
            print(f"[{time.time():.3f}] Yielding chunk #{chunk_yield_count}: {content_preview}")
            yield item
            # Small delay to allow frontend to render incrementally
            # await asyncio.sleep(0.05)  # 50ms delay between chunks


def create_default_llm() -> AsyncChatGoogleGenerativeAI:
    """Create the default Gemini client used across agents."""
    settings = get_settings()
    return AsyncChatGoogleGenerativeAI(
        model="gemini-2.5-pro",
        base_url=settings.google_ai_studio_base_url,
        transport="rest",
        include_thoughts=True,
        thinking_budget=1000,
        streaming=True
    )


def create_multi_agent_workflow(llm: AsyncChatGoogleGenerativeAI | None = None):
    """Create the multi-agent workflow using deepagents-inspired architecture.

    This creates:
    1. A supervisor agent that delegates tasks
    2. Four specialist sub-agents (ScriptWriter, ConceptArtist, StoryboardDesigner, Editor)
    3. Middleware stack (TodoList, Canvas, SubAgent)
    4. Canvas backend for tool operations

    Args:
        llm: Optional language model (defaults to Gemini 2.5 Pro)

    Returns:
        Compiled supervisor agent graph
    """
    llm = llm or create_default_llm()

    # Create backend and middleware
    backend = StateCanvasBackend()
    canvas_middleware = CanvasMiddleware(backend=backend)
    timeline_middleware = TimelineMiddleware()

    # Create specialist sub-agents
    subagents = create_specialist_agents(
        model=llm,
        canvas_middleware=canvas_middleware,
        timeline_middleware=timeline_middleware,
    )

    # Create supervisor agent with delegation capability
    from langgraph.checkpoint.memory import MemorySaver
    checkpointer = MemorySaver()
    
    supervisor = create_supervisor_agent(
        model=llm,
        subagents=subagents,
        backend=backend,
        checkpointer=checkpointer,
    )

    return supervisor


# Default compiled graph used by API/tests
graph = create_multi_agent_workflow()
