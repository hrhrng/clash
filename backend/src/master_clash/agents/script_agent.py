"""
Screenplay generation agent.
Converts story ideas into complete screenplays with characters, dialogue, and scenes.
"""


from langchain.agents import create_agent
from langchain.agents.structured_output import ProviderStrategy
from langchain_openai import ChatOpenAI
from master_clash.models import Screenplay
from master_clash.prompts import SCRIPT_GENERATION_SYSTEM_PROMPT
from master_clash.utils import load_input_data


def generate_screenplay(user_input: str) -> Screenplay:
    """
    Generate a complete screenplay from user input.

    Args:
        user_input: User's story idea or path to CSV file

    Returns:
        Screenplay object containing story outline, characters, locations, and acts
    """

    input_content = load_input_data(user_input)
    try:
        openrouter = ChatOpenAI(
            model="google/gemini-3-pro-preview",
            temperature=0.7,
            base_url='https://openrouter.ai/api/v1',
            openai_api_key='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',
        )

        agent = create_agent(
            model=openrouter,
            response_format=ProviderStrategy(Screenplay),
            system_prompt=SCRIPT_GENERATION_SYSTEM_PROMPT
        )
        result = agent.invoke(
            {"messages":[{"role":"user", 'content': input_content}]}
        )
        return result

    except Exception as e:
        print(f"Error during screenplay generation: {e}")
        raise


if __name__ == "__main__":
    test_input = "摇篮第一集.csv"
    screenplay = generate_screenplay(test_input)
    print("Generated Screenplay:")
    print(f"\nTitle: {screenplay.screenplay_title}")
    print(f"\nLogline: {screenplay.story_outline.one_sentence_logline}")
    print(f"\nTheme: {screenplay.thematic_elements.primary_theme}")
    print(f"\nCharacters: {len(screenplay.main_characters)}")
    print(f"\nScenes: {sum(len(act.scenes_in_act) for act in screenplay.three_acts)}")

