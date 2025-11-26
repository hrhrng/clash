"""
Script generation agent.
Converts story ideas into structured video production scripts.
"""

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage
from google import genai

from config import TEXT_MODEL_NAME, GEMINI_API_KEY
from models import ScriptOutput
from utils import load_input_data
from prompts import SCRIPT_GENERATION_SYSTEM_PROMPT


def generate_script(user_input: str) -> ScriptOutput:
    """
    Generate a structured video production script from user input.

    Args:
        user_input: User's story idea or path to CSV file

    Returns:
        ScriptOutput object containing concept, assets, and shot sequence
    """
    print("--- Running Agent 1: Script Generation ---")

    input_content = load_input_data(user_input)
    print(f"\n📝 Input: {input_content[:200]}...")

    try:
        script_llm = ChatGoogleGenerativeAI(
            model=TEXT_MODEL_NAME,
            temperature=0.7,
            client=genai.Client(api_key=GEMINI_API_KEY),
        )
        structured_script_llm = script_llm.with_structured_output(ScriptOutput)

        print(f"\n🤖 Using model: {TEXT_MODEL_NAME}")
        print("⏳ Generating script...")

        script_result = structured_script_llm.invoke([
            SystemMessage(content=SCRIPT_GENERATION_SYSTEM_PROMPT),
            HumanMessage(content=input_content)
        ])

        # Check if result is valid
        if script_result is None:
            raise ValueError("Model returned None. This may be due to API quota, authentication, or model availability issues.")

        if not hasattr(script_result, 'step_1_concept'):
            raise ValueError(f"Unexpected response type: {type(script_result)}. Expected ScriptOutput.")

        # Display Result
        print("\n✅ Script generated successfully!")
        print(f"\n📖 Story: {script_result.step_1_concept.story_outline[:100]}...")
        print(f"🎨 Aesthetic: {script_result.step_1_concept.global_aesthetic}")
        print(f"🎭 Genre: {script_result.step_1_concept.genre}")
        print(f"👥 Characters: {len(script_result.step_2_assets.characters)}")
        print(f"📍 Locations: {len(script_result.step_2_assets.locations)}")
        print(f"🎬 Shots: {len(script_result.step_3_sequence)}")

        return script_result

    except Exception as e:
        print(f"\n❌ Error generating script: {e}")
        print(f"\n🔍 Debugging info:")
        print(f"   Model: {TEXT_MODEL_NAME}")
        print(f"   API Key present: {bool(GEMINI_API_KEY)}")
        print(f"   API Key length: {len(GEMINI_API_KEY) if GEMINI_API_KEY else 0}")
        raise
