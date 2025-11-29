"""Video production workflow graph.

This module defines the LangGraph workflow for video production,
orchestrating screenplay generation, art direction, and shot generation
with checkpoint support for recovery and cost optimization.
"""

import time
import uuid
from typing import Any

from langgraph.graph import END, StateGraph

from master_clash.database import get_checkpointer
from master_clash.workflow.state import VideoProductionState


def initialize_state(state: VideoProductionState) -> VideoProductionState:
    """Initialize workflow state with metadata.

    This node sets up the initial state for a new workflow run.
    """
    if "run_id" not in state or not state.get("run_id"):
        state["run_id"] = str(uuid.uuid4())

    state["current_step"] = "initialization"
    state["total_cost"] = state.get("total_cost", 0.0)
    state["total_duration_ms"] = state.get("total_duration_ms", 0)
    state["api_call_count"] = state.get("api_call_count", 0)
    state["errors"] = state.get("errors", [])
    state["status"] = "running"
    state["messages"] = state.get("messages", [])
    state["shots"] = state.get("shots", [])

    return state


def generate_screenplay_node(state: VideoProductionState) -> VideoProductionState:
    """Generate screenplay from story input.

    This node uses the script agent to create a structured screenplay.
    """
    from master_clash.agents.script_agent import create_screenplay_from_csv

    start_time = time.time()
    state["current_step"] = "screenplay_generation"

    try:
        # Load story from CSV if path provided
        if state.get("story_csv_path"):
            screenplay = create_screenplay_from_csv(state["story_csv_path"])
        else:
            # TODO: Implement text-based story input
            raise ValueError("story_csv_path is required for screenplay generation")

        state["screenplay"] = screenplay
        state["screenplay_error"] = None

    except Exception as e:
        error_msg = f"Screenplay generation failed: {str(e)}"
        state["screenplay_error"] = error_msg
        state["errors"].append(error_msg)
        state["status"] = "failed"

    finally:
        duration_ms = int((time.time() - start_time) * 1000)
        state["total_duration_ms"] = state.get("total_duration_ms", 0) + duration_ms
        state["api_call_count"] = state.get("api_call_count", 0) + 1

    return state


def generate_assets_node(state: VideoProductionState) -> VideoProductionState:
    """Generate visual assets (character and location designs).

    This node uses the art director agent to create images.
    """
    from master_clash.agents.art_director_agent import ArtDirector

    start_time = time.time()
    state["current_step"] = "asset_generation"

    try:
        if not state.get("screenplay"):
            raise ValueError("Screenplay is required for asset generation")

        screenplay = state["screenplay"]
        art_director = ArtDirector()

        # Generate production design
        production_design = art_director.generate_production_design(
            screenplay=screenplay, mode="parallel"  # Use parallel for faster generation
        )

        # Convert to dict format for state storage
        state["production_design"] = {
            "character_designs": [
                {
                    "character_name": cd.character_name,
                    "image_paths": cd.image_paths,
                    "image_urls": cd.image_urls if hasattr(cd, "image_urls") else [],
                    "generation_params": cd.generation_params,
                }
                for cd in production_design.character_designs
            ],
            "location_designs": [
                {
                    "location_name": ld.location_name,
                    "image_paths": ld.image_paths,
                    "image_urls": ld.image_urls if hasattr(ld, "image_urls") else [],
                    "generation_params": ld.generation_params,
                }
                for ld in production_design.location_designs
            ],
        }
        state["art_direction_error"] = None

    except Exception as e:
        error_msg = f"Asset generation failed: {str(e)}"
        state["art_direction_error"] = error_msg
        state["errors"].append(error_msg)
        state["status"] = "failed"

    finally:
        duration_ms = int((time.time() - start_time) * 1000)
        state["total_duration_ms"] = state.get("total_duration_ms", 0) + duration_ms
        # Art direction makes multiple API calls (one per image)
        num_images = len(state.get("production_design", {}).get("character_designs", [])) + len(
            state.get("production_design", {}).get("location_designs", [])
        )
        state["api_call_count"] = state.get("api_call_count", 0) + num_images

    return state


def generate_shots_node(state: VideoProductionState) -> VideoProductionState:
    """Generate video shots using Kling AI.

    This node creates videos for each shot in the screenplay.
    """
    # TODO: Implement shot generation using Kling video tool
    # This is a placeholder for now

    start_time = time.time()
    state["current_step"] = "shot_generation"

    try:
        if not state.get("screenplay"):
            raise ValueError("Screenplay is required for shot generation")

        if not state.get("production_design"):
            raise ValueError("Production design is required for shot generation")

        # Placeholder: Mark as not implemented
        state["shot_generation_error"] = "Shot generation not yet implemented"
        state["errors"].append("Shot generation not yet implemented")

    except Exception as e:
        error_msg = f"Shot generation failed: {str(e)}"
        state["shot_generation_error"] = error_msg
        state["errors"].append(error_msg)
        state["status"] = "failed"

    finally:
        duration_ms = int((time.time() - start_time) * 1000)
        state["total_duration_ms"] = state.get("total_duration_ms", 0) + duration_ms

    return state


def finalize_state(state: VideoProductionState) -> VideoProductionState:
    """Finalize workflow state.

    This node marks the workflow as completed and performs cleanup.
    """
    state["current_step"] = "finalization"

    # Update status based on errors
    if state["errors"]:
        if state["status"] != "failed":
            state["status"] = "completed_with_errors"
    else:
        state["status"] = "completed"

    return state


def should_continue(state: VideoProductionState) -> str:
    """Conditional edge to determine if workflow should continue.

    Returns:
        "continue" to proceed, "end" to stop
    """
    # Stop if critical errors occurred
    if state.get("screenplay_error"):
        return "end"

    if state.get("status") == "failed":
        return "end"

    return "continue"


def create_video_production_workflow(
    checkpointer_enabled: bool = True,
) -> StateGraph:
    """Create the video production workflow graph.

    Args:
        checkpointer_enabled: Whether to enable checkpoint persistence

    Returns:
        Configured StateGraph instance
    """
    # Create the graph
    workflow = StateGraph(VideoProductionState)

    # Add nodes
    workflow.add_node("initialize", initialize_state)
    workflow.add_node("generate_screenplay", generate_screenplay_node)
    workflow.add_node("generate_assets", generate_assets_node)
    workflow.add_node("generate_shots", generate_shots_node)
    workflow.add_node("finalize", finalize_state)

    # Define the flow
    workflow.set_entry_point("initialize")

    workflow.add_edge("initialize", "generate_screenplay")

    workflow.add_conditional_edges(
        "generate_screenplay",
        should_continue,
        {
            "continue": "generate_assets",
            "end": "finalize",
        },
    )

    workflow.add_conditional_edges(
        "generate_assets",
        should_continue,
        {
            "continue": "generate_shots",
            "end": "finalize",
        },
    )

    workflow.add_conditional_edges(
        "generate_shots",
        should_continue,
        {
            "continue": "finalize",
            "end": "finalize",
        },
    )

    workflow.add_edge("finalize", END)

    # Compile with checkpointer if enabled
    if checkpointer_enabled:
        checkpointer = get_checkpointer(initialize=True)
        compiled_workflow = workflow.compile(checkpointer=checkpointer)
    else:
        compiled_workflow = workflow.compile()

    return compiled_workflow


async def run_video_production_workflow(
    story_csv_path: str | None = None,
    story_input: str | None = None,
    thread_id: str | None = None,
    resume: bool = False,
) -> dict[str, Any]:
    """Run the video production workflow.

    Args:
        story_csv_path: Path to story CSV file
        story_input: Text-based story input (alternative to CSV)
        thread_id: Thread ID for checkpoint recovery (optional)
        resume: Whether to resume from last checkpoint

    Returns:
        Final workflow state
    """
    workflow = create_video_production_workflow(checkpointer_enabled=True)

    # Prepare config
    if thread_id is None:
        thread_id = str(uuid.uuid4())

    config = {"configurable": {"thread_id": thread_id}}

    # Initialize state
    initial_state: VideoProductionState = {
        "story_csv_path": story_csv_path,
        "story_input": story_input or "",
        "run_id": thread_id,
        "messages": [],
    }

    # Run workflow
    if resume:
        # Resume from checkpoint
        final_state = await workflow.ainvoke(None, config=config)
    else:
        # Start fresh
        final_state = await workflow.ainvoke(initial_state, config=config)

    return final_state
