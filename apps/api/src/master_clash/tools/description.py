from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage
from master_clash.config import get_settings
from master_clash.utils import get_asset_base64

settings = get_settings()

def _call_gemini_with_base64(base64_data: str, mime_type: str) -> str:
    """
    Internal function to call Gemini with base64 data.
    """
    llm = ChatGoogleGenerativeAI(
        model="gemini-2.5-flash",
        base_url=settings.google_ai_studio_base_url,
        transport="rest",
    )

    content_block = [{"type": "text", "text": "Describe this asset in detail. Focus on visual elements, style, and mood."}]

    if mime_type.startswith("video/"):
        content_block.append({
            "type": "media",
            "data": base64_data,
            "mime_type": mime_type
        })
    else:
        content_block.append({
            "type": "image_url",
            "image_url": f"data:{mime_type};base64,{base64_data}"
        })

    message = HumanMessage(content=content_block)
    response = llm.invoke([message])
    return response.content


def generate_description(asset_url: str) -> str:
    """
    Generate a description for an image or video using Gemini.
    Args:
        asset_url: URL or data URI of the asset.
    Returns:
        Generated description text.
    """
    try:
        base64_data, mime_type = get_asset_base64(asset_url)
        return _call_gemini_with_base64(base64_data, mime_type)

    except Exception as e:
        print(f"Error generating description: {e}")
        return None
