"""Multi-agent LangGraph workflow for the creative canvas.

This module wires together four specialized agents (script, concept art,
storyboard, and editing) under a supervisor that routes turns between them.
"""

import asyncio
from dataclasses import dataclass
from typing import Annotated, Any, AsyncIterator, Optional, Sequence, TypedDict

from langchain.agents import create_agent
from langchain_core.callbacks import AsyncCallbackManagerForLLMRun
from langchain_core.messages import BaseMessage, HumanMessage
from langchain_core.outputs import ChatGenerationChunk, ChatResult
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.config import get_stream_writer
from langgraph.graph import END, StateGraph, add_messages
from pydantic import BaseModel
from typing_extensions import Literal

from master_clash.config import get_settings
from master_clash.workflow.tools import (
    create_node,
    list_node_info,
    read_node,
    timeline_editor,
    wait_for_task,
)


class AgentState(TypedDict):
    """Shared state passed between nodes in the workflow."""

    messages: Annotated[list[BaseMessage], add_messages]
    project_id: str


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
        queue: asyncio.Queue[ChatGenerationChunk | Exception | None] = asyncio.Queue()
        loop = asyncio.get_running_loop()

        def producer():
            try:
                for chunk in self._stream(messages, stop=stop, run_manager=None, **kwargs):
                    loop.call_soon_threadsafe(queue.put_nowait, chunk)
                loop.call_soon_threadsafe(queue.put_nowait, None)
            except Exception as e:  # pragma: no cover - surface to async consumer
                loop.call_soon_threadsafe(queue.put_nowait, e)

        loop.run_in_executor(None, producer)

        while True:
            item = await queue.get()
            if item is None:
                break
            if isinstance(item, Exception):
                raise item
            yield item


def create_default_llm() -> AsyncChatGoogleGenerativeAI:
    """Create the default Gemini client used across agents."""
    settings = get_settings()
    return AsyncChatGoogleGenerativeAI(
        model="gemini-2.5-pro",
        base_url=settings.google_ai_studio_base_url,
        transport="rest",
        include_thoughts=True,
        thinking_budget=1000,
    )


@dataclass(frozen=True)
class RoleDefinition:
    name: str
    prompt: str
    tools: Sequence[Any]


SCRIPT_WRITER_PROMPT = """You are a professional Script Writer.
Your goal is to create a compelling story.
1. Create a text node with the Story Outline / Script.
2. Create text nodes for Character Bios if needed.
Use `create_node` to place content on the canvas.
"""

CONCEPT_ARTIST_PROMPT = """You are a Concept Artist.
Your goal is to visualize the characters and scenes from the script.
1. Read the script from the canvas.
2. Create a Group node for each character or scene.
3. Inside the group, create a Prompt node with a detailed visual description.
4. Create an Image Generation node (type='image_gen') connected to the prompt.
5. AFTER creating a generation node, you MUST wait for it to complete before using its result.
   - Use `wait_for_task` to check status.
   - If status is 'generating' or 'node_not_found', WAIT (do nothing for a moment) and then RETRY `wait_for_task`.
   - Repeat until status is 'completed'.
"""

STORYBOARD_DESIGNER_PROMPT = """You are a Storyboard Designer.
Your goal is to create a sequence of shots for the video.
1. Create a Group node for the Storyboard.
2. Create Prompt nodes for each shot (Scene 1, Scene 2, etc.).
3. Create Image Generation nodes for each shot.
4. You can also create Video Generation nodes (type='video_gen') if needed.
5. ALWAYS wait for generation nodes to complete using `wait_for_task` before creating dependent nodes (like video from image).
   - If 'generating', retry after a short delay.
"""

EDITOR_PROMPT = """You are a Video Editor.
Your goal is to assemble the final video.
Use `timeline_editor` to arrange clips.
"""

ROLES: tuple[RoleDefinition, ...] = (
    RoleDefinition("ScriptWriter", SCRIPT_WRITER_PROMPT, [list_node_info, read_node, create_node]),
    RoleDefinition(
        "ConceptArtist",
        CONCEPT_ARTIST_PROMPT,
        [list_node_info, read_node, create_node, wait_for_task],
    ),
    RoleDefinition(
        "StoryboardDesigner",
        STORYBOARD_DESIGNER_PROMPT,
        [list_node_info, read_node, create_node, wait_for_task],
    ),
    RoleDefinition("Editor", EDITOR_PROMPT, [list_node_info, read_node, timeline_editor]),
)


SUPERVISOR_PROMPT = """You are the Supervisor. Use the `task_tool` to assign work to a sub-agent.
Call the tool with:
- agent: one of {members}
- instruction: clear task description for that agent
- attached_nodes: optional list of node ids relevant to the task

After the tool finishes, end the turn."""


async def supervisor_node(state: AgentState, chain):
    result = await chain.ainvoke(state)
    # Supervisor dispatches via task_tool; nothing else to route.
    return {}


def create_multi_agent_workflow(llm: AsyncChatGoogleGenerativeAI | None = None):
    """Create the compiled LangGraph for the multi-agent workflow."""
    llm = llm or create_default_llm()

    role_agents = {role.name: create_agent(llm, role.tools, system_prompt=role.prompt) for role in ROLES}

    @tool
    async def task_tool(agent: Literal["ScriptWriter", "ConceptArtist", "StoryboardDesigner", "Editor"], instruction: str, attached_nodes: list[str] | None = None, project_id: str | None = None) -> str:
        """Assign a task to a specific agent and run it immediately."""
        target = role_agents.get(agent)
        if not target:
            return f"Unknown agent: {agent}"

        # Build a minimal state for the sub-agent
        msg_content = instruction
        if attached_nodes:
            msg_content = f"{instruction}\nAttached nodes: {attached_nodes}"

        sub_state: AgentState = {
            "messages": [HumanMessage(content=msg_content)],
            "project_id": project_id or "",
        }

        writer = get_stream_writer()
        if writer:
            writer({"event": "subtask_start", "agent": agent, "instruction": instruction, "attached_nodes": attached_nodes or []})

        try:
            # Invoke sub-agent (non-streaming LangChain agent)
            result = await target.ainvoke(sub_state)
            messages = result.get("messages", [])
            if messages:
                last_msg = messages[-1]
                text = getattr(last_msg, "content", "")
                if writer:
                    writer({"event": "subtask_end", "agent": agent, "result": text})
                return f"{agent} completed: {text}"
            if writer:
                writer({"event": "subtask_end", "agent": agent, "result": "completed"})
            return f"{agent} completed"
        except Exception as exc:  # pragma: no cover
            if writer:
                writer({"event": "subtask_error", "agent": agent, "error": str(exc)})
            return f"{agent} error: {exc}"

    supervisor_chain = create_agent(
        llm,
        [task_tool],
        system_prompt=SUPERVISOR_PROMPT.format(members=", ".join(role_agents.keys())),
    )

    # Expose the supervisor agent as the graph (single-node graph).
    workflow = StateGraph(AgentState)
    workflow.add_node("Supervisor", supervisor_chain)
    workflow.set_entry_point("Supervisor")
    workflow.add_edge("Supervisor", END)

    return workflow.compile()


# Default compiled graph used by API/tests
graph = create_multi_agent_workflow()
