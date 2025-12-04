"""Multi-agent LangGraph workflow for the creative canvas.

This module wires together four specialized agents (script, concept art,
storyboard, and editing) under a supervisor that routes turns between them.
"""

import asyncio
from dataclasses import dataclass
from functools import partial
from typing import Annotated, Any, AsyncIterator, Optional, Sequence, TypedDict

from langchain.agents import create_agent
from langchain_core.callbacks import AsyncCallbackManagerForLLMRun
from langchain_core.messages import BaseMessage
from langchain_core.outputs import ChatGenerationChunk, ChatResult
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_google_genai import ChatGoogleGenerativeAI
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
    next: str
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
        thinking_level="low",
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


class Route(BaseModel):
    next: Literal["ScriptWriter", "ConceptArtist", "StoryboardDesigner", "Editor", "FINISH"]


def build_supervisor_chain(llm: AsyncChatGoogleGenerativeAI, members: Sequence[str]):
    """Supervisor picks the next role or finishes the workflow."""
    system_prompt = (
        "You are a supervisor tasked with managing a conversation between the"
        " following workers: {members}. Given the following user request,"
        " respond with the worker to act next. Each worker will perform a"
        " task and respond with their results and status. When finished,"
        " respond with FINISH."
    )
    options = ["FINISH"] + list(members)

    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", system_prompt),
            MessagesPlaceholder(variable_name="messages"),
            (
                "system",
                "Given the conversation above, who should act next? "
                "Or should we FINISH? Select one of: {options}",
            ),
        ]
    ).partial(options=str(options), members=", ".join(members))

    return prompt | llm.with_structured_output(Route)


async def supervisor_node(state: AgentState, chain):
    result = await chain.ainvoke(state)
    return {"next": result.next}


def build_agent_node(agent):
    async def node(state: AgentState):
        result = await agent.ainvoke(state)
        return {"messages": [result["messages"][-1]]}

    return node


def create_multi_agent_workflow(llm: AsyncChatGoogleGenerativeAI | None = None):
    """Create the compiled LangGraph for the multi-agent workflow."""
    llm = llm or create_default_llm()

    role_agents = {role.name: create_agent(llm, role.tools, system_prompt=role.prompt) for role in ROLES}
    supervisor_chain = build_supervisor_chain(llm, members=role_agents.keys())

    workflow = StateGraph(AgentState)
    workflow.add_node("Supervisor", partial(supervisor_node, chain=supervisor_chain))

    for name, agent in role_agents.items():
        workflow.add_node(name, build_agent_node(agent))
        workflow.add_edge(name, "Supervisor")

    workflow.add_conditional_edges(
        "Supervisor",
        lambda x: x["next"],
        {name: name for name in role_agents} | {"FINISH": END},
    )

    workflow.set_entry_point("Supervisor")

    return workflow.compile()


# Default compiled graph used by API/tests
graph = create_multi_agent_workflow()
