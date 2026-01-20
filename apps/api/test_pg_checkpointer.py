"""
Test script for PostgreSQL checkpointer.

This script tests the basic functionality of the PostgreSQL checkpointer.
"""

import asyncio
from langgraph.graph import StateGraph, START, END
from typing import TypedDict


# Define a simple state
class State(TypedDict):
    counter: int
    message: str


async def test_postgres_checkpointer():
    """Test PostgreSQL checkpointer with a simple workflow."""
    from master_clash.database.checkpointer import get_async_checkpointer

    print("🧪 Testing PostgreSQL Checkpointer...")

    # Get checkpointer
    checkpointer = await get_async_checkpointer()
    print(f"✅ Checkpointer created: {type(checkpointer).__name__}")

    # Create a simple workflow
    def increment(state: State) -> State:
        return {"counter": state["counter"] + 1, "message": f"Count is {state['counter'] + 1}"}

    # Build the graph
    workflow = StateGraph(State)
    workflow.add_node("increment", increment)
    workflow.add_edge(START, "increment")
    workflow.add_edge("increment", END)

    # Compile with checkpointer
    app = workflow.compile(checkpointer=checkpointer)

    # Test with a thread ID
    thread_id = "test_thread_123"
    config = {"configurable": {"thread_id": thread_id}}

    print(f"\n📝 Running workflow with thread_id: {thread_id}")

    # First run
    result1 = await app.ainvoke(
        {"counter": 0, "message": "Starting"},
        config=config
    )
    print(f"   First run result: {result1}")

    # Second run (should continue from checkpoint)
    result2 = await app.ainvoke(
        {"counter": result1["counter"], "message": "Continuing"},
        config=config
    )
    print(f"   Second run result: {result2}")

    # Verify checkpoint was saved
    checkpoint = await checkpointer.aget_tuple(config)
    if checkpoint:
        print(f"✅ Checkpoint saved successfully!")
        print(f"   Checkpoint ID: {checkpoint.config['configurable']['checkpoint_id']}")
    else:
        print(f"❌ No checkpoint found")

    # List checkpoints
    checkpoints = []
    async for cp in checkpointer.alist(config):
        checkpoints.append(cp)

    print(f"\n📋 Found {len(checkpoints)} checkpoints for thread {thread_id}")
    for i, cp in enumerate(checkpoints[:3]):  # Show first 3
        print(f"   {i+1}. Checkpoint ID: {cp.config['configurable']['checkpoint_id']}")

    print("\n✅ PostgreSQL Checkpointer test completed successfully!")


if __name__ == "__main__":
    asyncio.run(test_postgres_checkpointer())
