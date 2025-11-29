# %% [markdown]
# # AI Video Production Workflow (Gemini 3 Pro + LangGraph)
# 
# This notebook implements a 3-stage video production workflow using Google's **gemini-3-pro-preview**.
# 
# **Workflow:**
# 1.  **Script Agent:** Converts input (text/CSV) into a structured script (Characters, Scenes, Shots).
# 2.  **Setting Design Agent:** Generates detailed prompts and images for Characters and Scenes.
# 3.  **Storyboard Agent:** Generates storyboard panels for each shot using the style and assets from Step 2.
# 
# **Requirements:**
# `pip install langchain-google-genai langgraph pydantic pandas`

# %% [Setup] Imports & Configuration
import os
import json
import pandas as pd
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.tools import tool
from langgraph.prebuilt import create_react_agent

# --- Configuration ---
# ensure GOOGLE_API_KEY is set in your environment
os.environ["GOOGLE_API_KEY"] = "AIzaSyBFhyItl61CrSDyQEXIqQzwNOBwO8Pgv_o"

# MODEL CONFIGURATION
# Strict adherence to user requested models
TEXT_MODEL_NAME = "gemini-3-pro-preview"
IMAGE_MODEL_NAME = "gemini-3-pro-image-preview"

print(f"Using Models: Text='{TEXT_MODEL_NAME}', Image='{IMAGE_MODEL_NAME}'")

# %% [Definitions] Data Structures & Tools

# --- Pydantic Models for Script Structure ---

class Shot(BaseModel):
    scene_id: str = Field(description="Scene Number (场号)")
    shot_id: str = Field(description="Shot Number (镜头号)")
    shot_type: str = Field(description="Shot Type (e.g. Animation, Real, Close-up)")
    camera_movement: str = Field(description="Camera Movement (e.g. Pan, Zoom, Static)")
    shot_size: str = Field(description="Shot Size (e.g. Full, Medium, Close-up)")
    content: str = Field(description="Visual Content description")
    dialogue: str = Field(description="Dialogue or Monologue", default="")
    sound: str = Field(description="Sound effects or music", default="")

class Character(BaseModel):
    name: str
    description: str = Field(description="Visual description, personality, attire")

class Scene(BaseModel):
    name: str
    description: str = Field(description="Visual description of the location/environment")

class Item(BaseModel):
    name: str
    description: str = Field(description="Visual description of the object")

class ScriptOutput(BaseModel):
    title: str
    style: str = Field(description="Global art style (e.g. Hyper-realistic, Pixar, Anime)")
    characters: List[Character]
    scenes: List[Scene]
    items: List[Item]
    shots: List[Shot]

# --- Tools ---

@tool
def generate_image(prompt: str, filename: str) -> str:
    """
    Generates an image using the gemini-3-pro-image-preview model based on the prompt.
    
    Args:
        prompt: The detailed image generation prompt.
        filename: The filename to save the image as (e.g., 'char_noah.png').
    """
    print(f"\n🎨 [Generating Image] '{filename}'")
    print(f"   Prompt: {prompt[:100]}...")
    
    # In a real implementation, you would call the Gemini Image API here.
    # For this interactive script, we simulate the file creation.
    
    save_dir = "production_assets"
    os.makedirs(save_dir, exist_ok=True)
    file_path = os.path.join(save_dir, filename)
    
    # Mocking the image creation
    with open(file_path, "w") as f:
        f.write(f"[Mock Image Content]\nModel: {IMAGE_MODEL_NAME}\nPrompt: {prompt}")
        
    return f"Image saved to {file_path}"

# %% [Agent 1] Script Generation Agent
# This agent takes raw input and structures it.

def load_input_data(source: str):
    """Helper to load text or CSV data."""
    if source.endswith(".csv") and os.path.exists(source):
        df = pd.read_csv(source)
        return df.to_markdown(index=False)
    return source

# INPUT YOUR IDEA OR FILE PATH HERE
user_input_source = "A sci-fi short about a robot finding a flower in a wasteland."
# user_input_source = "回忆罐脚本.csv" 

print("--- Running Agent 1: Script Generation ---")

input_content = load_input_data(user_input_source)

# We use the structured output capability of the model directly for the best result
# equivalent to a specialized agent for data extraction.
script_llm = ChatGoogleGenerativeAI(model=TEXT_MODEL_NAME, temperature=0.7)
structured_script_llm = script_llm.with_structured_output(ScriptOutput)

system_prompt_1 = """
You are an expert Screenwriter and Director.
Analyze the input (which could be a raw idea or a CSV script) and structure it into a production-ready format.

You MUST extract:
1. **Global Style**: Define a cohesive art style (e.g., Hyper-realistic, Anime).
2. **Characters**: All key characters with visual details.
3. **Scenes**: All unique locations.
4. **Items**: Important props.
5. **Shots**: A step-by-step storyboard list.

If the input is a CSV, preserve the existing shot flow but enhance descriptions if needed.
"""

# Execute Agent 1
script_result = structured_script_llm.invoke([
    SystemMessage(content=system_prompt_1),
    HumanMessage(content=input_content)
])

# Display Result
print(f"\n🎬 Title: {script_result.title}")
print(f"🎨 Style: {script_result.style}")
print(f"👥 Characters: {len(script_result.characters)}")
print(f"📍 Scenes: {len(script_result.scenes)}")
print(f"🎬 Shots: {len(script_result.shots)}")

# %% [Agent 2] Setting Design Agent (LangGraph ReAct)
# This agent actively calls tools to generate reference images for characters and scenes.

print("--- Running Agent 2: Setting & Character Design ---")

# 1. Create the ReAct Agent using LangGraph 1.0 prebuilt method
setting_llm = ChatGoogleGenerativeAI(model=TEXT_MODEL_NAME, temperature=0.7)
setting_agent = create_react_agent(setting_llm, tools=[generate_image])

# 2. Construct the Task Prompt
# We explicitly list what needs to be designed based on Agent 1's output.
design_tasks = []
for char in script_result.characters:
    design_tasks.append(f"- Character: {char.name} ({char.description}) -> filename: char_{char.name.lower().replace(' ', '_')}.png")

for scene in script_result.scenes:
    design_tasks.append(f"- Scene: {scene.name} ({scene.description}) -> filename: scene_{scene.name.lower().replace(' ', '_')}.png")

for item in script_result.items:
    design_tasks.append(f"- Item: {item.name} ({item.description}) -> filename: item_{item.name.lower().replace(' ', '_')}.png")

task_list_str = "\n".join(design_tasks)

agent_2_prompt = f"""
You are the **Art Director**.
Global Style: {script_result.style}

Your task is to generate reference images (Settings) for the following assets.
You MUST maintain consistency with the Global Style.

Assets to design:
{task_list_str}

For EACH asset:
1. Write a highly detailed image prompt (lighting, texture, camera angle, style).
2. Call the `generate_image` tool with the prompt and the specified filename.
"""

# 3. Execute Agent 2
# The agent will autonomously loop through tool calls.
result_2 = setting_agent.invoke({"messages": [HumanMessage(content=agent_2_prompt)]})

print("\n✅ Setting Design Phase Complete.")

# %% [Agent 3] Storyboard Agent (LangGraph ReAct)
# This agent generates the actual shot images, referencing the settings.

print("--- Running Agent 3: Storyboard Generation ---")

# 1. Create the ReAct Agent
storyboard_llm = ChatGoogleGenerativeAI(model=TEXT_MODEL_NAME, temperature=0.7)
storyboard_agent = create_react_agent(storyboard_llm, tools=[generate_image])

# 2. Construct the Task Prompt
# We batch the shots for the agent to process.
shots_data = []
for shot in script_result.shots:
    shot_desc = f"Shot {shot.shot_id}: {shot.content} (Size: {shot.shot_size}, Cam: {shot.camera_movement})"
    shots_data.append(shot_desc)

shots_str = "\n".join(shots_data)

agent_3_prompt = f"""
You are the **Storyboard Artist**.
Global Style: {script_result.style}

Your task is to generate a storyboard panel for every shot in the script.
Refer to the characters and scenes designed in the previous step (assume those files exist).

Script:
{shots_str}

For EACH shot:
1. Create a visual prompt matching the global style and shot description.
2. Call `generate_image` tool.
   - Filename format: 'shot_{{shot_id}}.png'.
"""

# 3. Execute Agent 3
# Depending on the number of shots, this might take a while as the agent makes many tool calls.
# To avoid hitting limits in a single turn, we could split this, but the agent loop handles it.
result_3 = storyboard_agent.invoke({"messages": [HumanMessage(content=agent_3_prompt)]})

print("\n✅ Storyboard Phase Complete.")
print(f"All assets saved to: {os.path.abspath('production_assets')}")
