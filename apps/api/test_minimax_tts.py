"""
Quick test script for MiniMax TTS integration
"""
import asyncio
import sys
import os

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from master_clash.services.minimax_tts import TTSRequest, generate_speech


async def test_minimax_tts():
    """Test MiniMax TTS generation"""

    print("🎵 Testing MiniMax TTS...")

    request = TTSRequest(
        text="你好，这是一个测试。Hello, this is a test.",
        voice_id="female-warm",
        speed=1.0,
        pitch=0,
    )

    result = await generate_speech(request)

    if result.success:
        print(f"✅ Success! Audio generated: {len(result.audio_base64) if result.audio_base64 else 0} bytes")
        print(f"   Metadata: {result.metadata}")
    else:
        print(f"❌ Failed: {result.error}")

    return result.success


if __name__ == "__main__":
    success = asyncio.run(test_minimax_tts())
    sys.exit(0 if success else 1)
