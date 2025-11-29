"""Example: Video production workflow with checkpointing.

This example demonstrates how to use LangGraph workflows with
checkpoint persistence for resilient video production.
"""

import asyncio
from pathlib import Path

from master_clash.database import init_database
from master_clash.database.metadata import MetadataTracker
from master_clash.workflow import run_video_production_workflow


async def example_basic_workflow():
    """Basic workflow execution with automatic checkpointing."""

    print("=== Basic Workflow Example ===\n")

    # Initialize database (only needed once)
    init_database()
    print("✓ Database initialized\n")

    # Run workflow
    story_csv = Path("examples/sample_story.csv")
    if not story_csv.exists():
        print(f"⚠ Story file not found: {story_csv}")
        print("  Please create a sample story CSV first.\n")
        return

    print(f"Running workflow with story: {story_csv}\n")

    result = await run_video_production_workflow(
        story_csv_path=str(story_csv), thread_id="example-run-1"
    )

    print("\n=== Workflow Results ===")
    print(f"Status: {result.get('status')}")
    print(f"Run ID: {result.get('run_id')}")
    print(f"Total Cost: ${result.get('total_cost', 0):.2f}")
    print(f"Duration: {result.get('total_duration_ms', 0) / 1000:.2f}s")
    print(f"API Calls: {result.get('api_call_count', 0)}")

    if result.get("errors"):
        print(f"\nErrors encountered: {len(result['errors'])}")
        for error in result["errors"]:
            print(f"  - {error}")


async def example_resume_workflow():
    """Resume workflow from checkpoint after failure."""

    print("\n=== Resume Workflow Example ===\n")

    thread_id = "example-run-2"

    # Simulate workflow that might fail
    print(f"Starting workflow (thread_id={thread_id})...\n")

    try:
        result = await run_video_production_workflow(
            story_csv_path="examples/sample_story.csv", thread_id=thread_id
        )

        if result.get("status") == "failed":
            print("⚠ Workflow failed. Attempting to resume...\n")

            # Resume from last checkpoint
            result = await run_video_production_workflow(thread_id=thread_id, resume=True)

            print("✓ Workflow resumed successfully!")
            print(f"Final status: {result.get('status')}\n")

    except Exception as e:
        print(f"❌ Error: {e}\n")
        print("You can manually resume later with:")
        print(f'  await run_video_production_workflow(thread_id="{thread_id}", resume=True)\n')


async def example_metadata_tracking():
    """Track detailed metadata for workflow execution."""

    print("\n=== Metadata Tracking Example ===\n")

    run_id = "example-run-3"
    tracker = MetadataTracker(run_id)

    # Start workflow
    tracker.start_workflow("video_production", metadata={"user_id": "user-123", "priority": "high"})

    print(f"Started tracking workflow: {run_id}\n")

    # Simulate some work
    print("Simulating workflow steps...\n")

    # Record assets
    tracker.record_asset(
        asset_type="screenplay",
        asset_path="output/screenplay.json",
        checkpoint_id="ckpt-1",
        cost=0.05,
        duration_ms=5000,
        generation_params={"model": "gpt-4", "temperature": 0.7},
    )

    tracker.record_asset(
        asset_type="character_image",
        asset_path="output/character_1.png",
        asset_url="https://example.com/character_1.png",
        checkpoint_id="ckpt-2",
        cost=0.10,
        duration_ms=180000,
        generation_params={"model": "nano-banana", "style": "cinematic"},
    )

    # Record API calls
    tracker.record_api_call(
        service="openai",
        endpoint="/v1/chat/completions",
        checkpoint_id="ckpt-1",
        request_params={"model": "gpt-4", "messages": [{"role": "user", "content": "..."}]},
        response_data={"choices": [{"message": {"content": "..."}}]},
        status_code=200,
        cost=0.05,
        duration_ms=5000,
    )

    # Update workflow status
    tracker.update_workflow_status(status="completed", total_cost=0.15)

    # Get statistics
    stats = tracker.get_workflow_stats()

    print("=== Workflow Statistics ===")
    print(f"Run ID: {stats['run_id']}")
    print(f"Workflow: {stats['workflow_name']}")
    print(f"Status: {stats['status']}")
    print(f"Total Cost: ${stats['total_cost']:.2f}")
    print(f"API Cost: ${stats['api_cost']:.2f}")
    print(f"API Calls: {stats['api_call_count']}")
    print(f"Checkpoints: {stats['checkpoint_count']}")
    print(f"Total API Duration: {stats['total_api_duration_ms'] / 1000:.2f}s")

    print("\nAssets by Type:")
    for asset_type, count in stats["assets_by_type"].items():
        print(f"  {asset_type}: {count}")

    print(f"\nMetadata: {stats['metadata']}\n")

    tracker.close()


async def example_cost_analysis():
    """Analyze costs across multiple workflow runs."""

    print("\n=== Cost Analysis Example ===\n")

    from master_clash.database.connection import get_db_connection

    conn = get_db_connection()
    cursor = conn.cursor()

    # Total cost across all workflows
    cursor.execute("SELECT SUM(total_cost) as total FROM workflow_executions")
    total_cost = cursor.fetchone()[0] or 0
    print(f"Total cost across all workflows: ${total_cost:.2f}\n")

    # Cost breakdown by service
    cursor.execute(
        """
        SELECT service, COUNT(*) as calls, SUM(cost) as total_cost
        FROM api_logs
        GROUP BY service
        ORDER BY total_cost DESC
    """
    )

    print("Cost by Service:")
    for row in cursor.fetchall():
        service, calls, cost = row
        print(f"  {service}: ${cost:.2f} ({calls} calls)")

    # Most expensive workflows
    cursor.execute(
        """
        SELECT run_id, workflow_name, total_cost, status
        FROM workflow_executions
        ORDER BY total_cost DESC
        LIMIT 5
    """
    )

    print("\nTop 5 Most Expensive Workflows:")
    for row in cursor.fetchall():
        run_id, workflow_name, cost, status = row
        print(f"  {run_id[:20]}... - {workflow_name}: ${cost:.2f} ({status})")

    # Average cost per step
    cursor.execute(
        """
        SELECT step_name, AVG(total_cost) as avg_cost, COUNT(*) as count
        FROM checkpoint_metadata
        WHERE total_cost > 0
        GROUP BY step_name
        ORDER BY avg_cost DESC
    """
    )

    print("\nAverage Cost by Step:")
    for row in cursor.fetchall():
        step_name, avg_cost, count = row
        print(f"  {step_name}: ${avg_cost:.4f} (from {count} executions)")

    conn.close()


async def example_checkpoint_inspection():
    """Inspect checkpoints for a workflow run."""

    print("\n=== Checkpoint Inspection Example ===\n")

    from master_clash.database import get_checkpointer
    from master_clash.database.checkpointer import list_checkpoints

    thread_id = "example-run-1"
    checkpointer = get_checkpointer()

    # List all checkpoints
    checkpoints = list_checkpoints(checkpointer, thread_id=thread_id)

    if not checkpoints:
        print(f"No checkpoints found for thread_id={thread_id}\n")
        return

    print(f"Found {len(checkpoints)} checkpoints for {thread_id}:\n")

    for i, cp in enumerate(checkpoints, 1):
        print(f"{i}. Checkpoint ID: {cp['checkpoint_id']}")
        print(f"   Namespace: {cp['checkpoint_ns']}")
        print(f"   Parent: {cp['parent_checkpoint_id']}")
        print(f"   Metadata: {cp['metadata']}\n")

    # Get the latest checkpoint
    config = {"configurable": {"thread_id": thread_id}}
    latest = checkpointer.get(config)

    if latest:
        print("Latest Checkpoint State:")
        print(f"  Current Step: {latest.state.get('current_step', 'unknown')}")
        print(f"  Status: {latest.state.get('status', 'unknown')}")
        print(f"  Total Cost: ${latest.state.get('total_cost', 0):.2f}")
        print(f"  Errors: {len(latest.state.get('errors', []))}")


async def main():
    """Run all examples."""

    print("\n" + "=" * 60)
    print("Master Clash - Workflow with Checkpoints Examples")
    print("=" * 60 + "\n")

    # Run examples
    await example_basic_workflow()
    await example_resume_workflow()
    await example_metadata_tracking()
    await example_cost_analysis()
    await example_checkpoint_inspection()

    print("\n" + "=" * 60)
    print("All examples completed!")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    asyncio.run(main())
