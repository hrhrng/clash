"""
Prompt templates for video production agents.
"""

SCRIPT_GENERATION_SYSTEM_PROMPT = """
# Role
You are an expert Director & Screenwriter Agent.
Your process is: **Concept -> Assets -> Execution**.

# Task
Convert user input into a structured **Video Production Blueprint (JSON)**.

# Execution Flow (Strict Order)
1.  **Story Outline**: First, write a concise, colloquial summary of the entire plot. Expand on the user's input to ensure a beginning, middle, and end.
2.  **Assets Definition**: Based on the outline, define the consistent characters and locations (`visual_anchor`).
3.  **Shot Breakdown**: Finally, breakdown the outline into specific shots with detailed visual and acting instructions.

# JSON Output Schema
Output ONLY a valid JSON object matching this structure:

```json
{
  "step_1_concept": {
    "story_outline": "String (Simple, colloquial summary of the plot. e.g., 'A boy finds a robot in the rain, they become friends, but the police chase them away.').",
    "genre": "String",
    "global_aesthetic": "String (Art style, lighting, and mood keywords)"
  },
  "step_2_assets": {
    "characters": [
      {
        "id": "char_1",
        "name": "String",
        "visual_anchor": "String (Fixed visual features. e.g., 'Teenage boy, yellow raincoat, messy hair')"
      }
    ],
    "locations": [
      {
        "id": "loc_1",
        "name": "String",
        "environment_anchor": "String (Fixed environment details. e.g., 'Cyberpunk alleyway, neon signs, wet pavement')"
      }
    ]
  },
  "step_3_sequence": [
    {
      "shot_id": 1,
      "scene_id": "loc_1",
      "char_ids": ["char_1"],
      "duration_sec": 4,
      "narrative_beat": "String (Which part of the outline is this?)",
      "visual_spec": {
        "camera": {
          "shot_size": "String (e.g., 'Medium Shot')",
          "angle": "String (e.g., 'Eye-level')",
          "movement": "String (e.g., 'Tracking')"
        },
        "blocking": "String (Where are they standing? Spatial layout.)",
        "lighting_atmosphere": "String"
      },
      "performance": {
        "emotional_context": "String (The internal feeling, e.g., 'Curiosity mixed with fear')",
        "visible_acting": "String (The external action, e.g., 'Slowly reaching out hand, eyes wide, body tense')"
      },
      "audio": {
        "dialogue": "String",
        "sfx": "String"
      }
    }
  ]
}
"""


def get_character_prompt(char_name: str, char_visual: str, global_style: str) -> str:
    """
    Generate prompt for character reference image.

    Args:
        char_name: Character name
        char_visual: Character visual anchor description
        global_style: Global aesthetic style

    Returns:
        Formatted prompt string
    """
    return f"""
Character Design Sheet:
Name: {char_name}
Visual Description: {char_visual}

Style: {global_style}

Create a detailed character reference image showing the character from multiple angles (front, side, back view).
Include close-up details of important features.
This will be used as a visual anchor for consistent character appearance throughout the production.
"""


def get_location_prompt(loc_name: str, loc_visual: str, global_style: str) -> str:
    """
    Generate prompt for location reference image.

    Args:
        loc_name: Location name
        loc_visual: Location environment anchor description
        global_style: Global aesthetic style

    Returns:
        Formatted prompt string
    """
    return f"""
Environment/Location Design:
Name: {loc_name}
Visual Description: {loc_visual}

Style: {global_style}

Create a detailed environment/location concept art showing the setting from multiple perspectives.
Include atmospheric details, lighting, and mood.
This will be used as a visual anchor for consistent location appearance throughout the production.
"""


def get_shot_prompt(shot) -> str:
    """
    Generate prompt for shot keyframe image.

    Args:
        shot: Shot object with all specifications

    Returns:
        Formatted prompt string
    """
    return f"""
Shot #{shot.shot_id}
Duration: {shot.duration_sec} seconds

NARRATIVE CONTEXT:
{shot.narrative_beat}

CAMERA SETUP:
- Shot Size: {shot.visual_spec.camera.shot_size}
- Camera Angle: {shot.visual_spec.camera.angle}
- Camera Movement: {shot.visual_spec.camera.movement}

BLOCKING & COMPOSITION:
{shot.visual_spec.blocking}

LIGHTING & ATMOSPHERE:
{shot.visual_spec.lighting_atmosphere}

PERFORMANCE & ACTION:
- Emotional Context: {shot.performance.emotional_context}
- Visible Acting: {shot.performance.visible_acting}

AUDIO (for context):
- Dialogue: {shot.audio.dialogue}
- SFX: {shot.audio.sfx}

Generate a single keyframe that captures this exact moment.
Use the reference images provided to maintain character and location consistency.
Focus on cinematography, composition, and the emotional beat of the scene.
"""
