import asyncio
from langchain_core.messages import HumanMessage
from master_clash.workflow.multi_agent import graph

async def main():
    inputs = {
        "messages": [HumanMessage(content="Create a workspace group called 'Test Group'")],
        "project_id": "test_project",
        "next": "Supervisor"
    }
    from langgraph.checkpoint.memory import MemorySaver
    checkpointer = MemorySaver()
    
    # Re-create graph with checkpointer for this test
    # Note: In a real scenario, we'd modify how graph is created in multi_agent.py
    # But since we already modified multi_agent.py, we can just import the updated graph
    # However, graph is created at module level in multi_agent.py, so we need to reload it or recreate it here
    
    from master_clash.workflow.multi_agent import create_multi_agent_workflow
    graph_with_memory = create_multi_agent_workflow()
    
    config = {"configurable": {"thread_id": "test_thread"}}
    stream_modes = ["messages", "custom"]
    print("Starting graph execution with config and checkpointer...")
    try:
        async for streamed in graph_with_memory.astream(
            inputs,
            config=config,
            stream_mode=stream_modes,
            subgraphs=True,
        ):
            print(streamed)
    except Exception as e:
        print(f"Caught exception: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
