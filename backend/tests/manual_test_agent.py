import asyncio
import json
import uuid
from typing import Dict, Any, List
import pytest
from langchain_core.messages import HumanMessage
from master_clash.context import ProjectContext, NodeModel, EdgeModel, set_project_context, get_project_context
from master_clash.workflow.multi_agent import graph, AsyncChatGoogleGenerativeAI
from master_clash.config import get_settings

# Mock Project ID
PROJECT_ID = "test-project-001"

settings = get_settings()

@pytest.fixture
def gemini_llm():
    """LLM instance configured for integration tests."""
    settings = get_settings()
    return AsyncChatGoogleGenerativeAI(
    model="gemini-2.5-pro",
    base_url=settings.google_ai_studio_base_url,
    transport="rest",
    include_thoughts=True,
    thinking_budget=1000,
)

@pytest.mark.asyncio
async def test_async_generate_returns_text(gemini_llm):
    """Ensure ainvoke on the async wrapper returns non-empty text."""
    response = await gemini_llm.ainvoke("Say hi in one concise sentence.")
    print(response)
    assert hasattr(response, "content")
    assert isinstance(response.content, str)
    assert response.content.strip() != ""

@pytest.mark.asyncio
async def test_async_stream_produces_chunks(gemini_llm):
    """Streaming should yield at least one text chunk."""
    chunks: List[str] = []
    async for (chunk) in gemini_llm.astream("Stream a short greeting."):
        print(chunk)
        content = chunk.content
        if isinstance(content, list):
            text = "".join(
                part.get("text", "") if isinstance(part, dict) else str(part) for part in content
            )
        else:
            text = str(content)
        if text.strip():
            chunks.append(text)
    assert chunks, "Expected at least one non-empty streamed chunk"

def create_initial_context():
    """Initialize an empty project context."""
    context = ProjectContext(nodes=[], edges=[])
    set_project_context(PROJECT_ID, context)
    print(f"[Setup] Initialized empty context for project: {PROJECT_ID}")

def update_context_from_proposal(proposal: Dict[str, Any]):
    """Simulate frontend creating a node from a proposal."""
    context = get_project_context(PROJECT_ID)
    
    node_data = proposal["nodeData"]
    node_id = node_data["id"]
    node_type = proposal["nodeType"]
    
    # Create the new node
    new_node = NodeModel(
        id=node_id,
        type=node_type,
        data=node_data,
        position={"x": 0, "y": 0}, # Dummy position
        parentId=proposal.get("groupId")
    )
    
    # Add to context
    context.nodes.append(new_node)
    
    # If it's a generative node, let's simulate "auto-run" and asset generation
    if node_type in ["action-badge-image", "action-badge-video"]:
        print(f"[Sim] Simulating asset generation for {node_id}...")
        asset_id = f"asset-{uuid.uuid4().hex[:6]}"
        new_node.data["assetId"] = asset_id
        new_node.data["status"] = "completed"
        print(f"[Sim] Asset generated: {asset_id}")

    set_project_context(PROJECT_ID, context)
    print(f"[Frontend] Created node: {node_id} ({node_type})")

async def run_simulation():
    create_initial_context()
    
    user_input = "Create a short story about a robot who loves gardening."
    print(f"\n[User] {user_input}\n")
    
    inputs = {
        "messages": [HumanMessage(content=f"Project ID: {PROJECT_ID}. {user_input}")],
        "project_id": PROJECT_ID,
        "next": "Supervisor"
    }
    
    print("--- Starting Workflow ---")
    
    step_count = 0
    max_steps = 30 # Safety limit
    
    frontend_events = []

    event_count = 0
    first_chunk_written = False
    try:
        async for event in graph.astream_events(inputs, version="v1"):
            event_count += 1
            if event_count > 50: # Stop after 50 events to ensure we save
                break
            
            kind = event["event"]
            name = event["name"]
            data = event["data"]
            
            # print(f"Event: {kind} - {name}")
            print(f"Event: {kind} - {name}")
            
            if kind == "on_chat_model_stream":
                chunk = data["chunk"]
                
                with open("all_chunks_debug.txt", "a") as f:
                    f.write(f"Event: {name}\n{chunk}\n\n")
                
                # Check for usage metadata (thinking tokens)
                usage_metadata = chunk.usage_metadata
                if usage_metadata:
                    output_details = usage_metadata.get("output_token_details", {})
                    reasoning_count = output_details.get("reasoning", 0)
                    if reasoning_count > 0:
                        print(f"\n[Thinking Tokens: {reasoning_count}]", end="", flush=True)
                        frontend_events.append({
                            "type": "thinking_metadata",
                            "count": reasoning_count
                        })

                content = chunk.content
                if isinstance(content, list):
                    # Handle list content (e.g. [{'type': 'text', 'text': '...'}])
                    text_content = ""
                    for part in content:
                        if isinstance(part, dict) and part.get("type") == "text":
                            text_content += part.get("text", "")
                    content = text_content
                
                if content and not first_chunk_written:
                     print("Writing first TEXT chunk to file...")
                     with open("first_text_chunk_debug.txt", "w") as f:
                         f.write(str(chunk))
                     first_chunk_written = True
                if content:
                    print(content, end="", flush=True)
                    frontend_events.append({
                        "type": "thinking",
                        "agent": name,
                        "content": content
                    })
                
            elif kind == "on_tool_start":
                print(f"\n[Tool Start] {name}")
                frontend_events.append({
                    "type": "tool_start",
                    "agent": "Agent",
                    "tool": name,
                    "input": data.get("input")
                })

            elif kind == "on_tool_end":
                output = data.get("output")
                # Check for node proposals
                try:
                    if isinstance(output, str):
                        result_json = json.loads(output)
                        if isinstance(result_json, dict) and result_json.get("action") == "create_node_proposal":
                            proposal = result_json["proposal"]
                            print(f"\n[Tool] Proposal received from {name}: {proposal['message']}")
                            
                            frontend_events.append({
                                "type": "node_proposal",
                                "proposal": proposal
                            })
                            
                            # Simulate Frontend Action
                            update_context_from_proposal(proposal)
                        elif isinstance(result_json, dict) and result_json.get("action") == "timeline_edit":
                             frontend_events.append({
                                "type": "timeline_edit",
                                "data": result_json
                            })
                            
                except (json.JSONDecodeError, TypeError):
                    pass
                
                frontend_events.append({
                    "type": "tool_end",
                    "agent": "Agent",
                    "tool": name,
                    "output": str(output)[:200]
                })
                    
            elif kind == "on_chain_end":
                # High level chain end
                pass
    except (Exception, asyncio.CancelledError) as e:
        print(f"\nStopped: {e}")
    finally:
        print("\n--- Simulation Finished ---")
        
        # Save to file
        with open("simulation_output.json", "w") as f:
            json.dump(frontend_events, f, indent=2)
        print("Saved simulation output to simulation_output.json")

if __name__ == "__main__":
    
    settings = get_settings()
    gemini_llm = AsyncChatGoogleGenerativeAI(
        model="gemini-2.5-pro",
        base_url=settings.google_ai_studio_base_url,
        transport="rest",
        include_thoughts=True,
        thinking_budget=1000,
    )
    asyncio.run(test_async_stream_produces_chunks(gemini_llm))
