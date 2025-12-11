import asyncio
from langchain_google_genai import ChatGoogleGenerativeAI
from master_clash.config import get_settings

settings = get_settings()

async def test_llm():
    print(f"Testing LLM with base_url: {settings.google_ai_studio_base_url}")
    
    # Test 1: Sync Invoke with REST
    print("\n--- Test 1: Sync Invoke (REST) ---")
    try:
        llm = ChatGoogleGenerativeAI(
            model="gemini-3-pro-preview",
            base_url=settings.google_ai_studio_base_url,
            transport="rest",
            generation_config={"include_thoughts": True}
        )
        msg = llm.invoke("Hello, say hi.")
        print(f"Response: {msg.content}")
        print(f"Full Response: {msg}")
    except Exception as e:
        print(f"Error: {e}")

    # Test 2: Async Invoke with REST
    print("\n--- Test 2: Async Invoke (REST) ---")
    try:
        llm = ChatGoogleGenerativeAI(
            model="gemini-2.0-flash-exp",
            base_url=settings.google_ai_studio_base_url,
            transport="rest",
        )
        msg = await llm.ainvoke("Hello, say hi async.")
        print(f"Response: {msg.content}")
    except Exception as e:
        print(f"Error: {e}")

    # Test 3: Async Stream with REST
    print("\n--- Test 3: Async Stream (REST) ---")
    try:
        llm = ChatGoogleGenerativeAI(
            model="gemini-2.0-flash-exp",
            base_url=settings.google_ai_studio_base_url,
            transport="rest",
        )
        async for chunk in llm.astream("Hello, say hi stream."):
            print(f"Chunk: {chunk.content}", end="|")
        print()
    except Exception as e:
        print(f"Error: {e}")

    # Test 4: Async Invoke (gRPC - Default)
    print("\n--- Test 4: Async Invoke (gRPC) ---")
    try:
        llm = ChatGoogleGenerativeAI(
            model="gemini-3-pro-preview",
            base_url=settings.google_ai_studio_base_url,
            # transport="grpc", # Default
        )
        msg = await llm.ainvoke("Hello, say hi async grpc.")
        print(f"Response: {msg.content}")
        print(f"Full Response: {msg}")
    except Exception as e:
        print(f"Error: {e}")
if __name__ == "__main__":
    asyncio.run(test_llm())
