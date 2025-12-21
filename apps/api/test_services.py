"""
测试 Video Intelligence 和 Gemini ASR 服务
"""

import asyncio
import sys
from pathlib import Path

# 添加 src 到路径
sys.path.insert(0, str(Path(__file__).parent / "src"))

from master_clash.services.video_intelligence import VideoIntelligenceService
from master_clash.services.gemini_asr import GeminiASRService


async def test_video_intelligence(video_path: str):
    """测试 Video Intelligence Shot Detection"""
    print("\n" + "=" * 60)
    print("Testing Video Intelligence - Shot Detection")
    print("=" * 60)

    try:
        service = VideoIntelligenceService()

        print(f"Processing: {video_path}")
        print("Detecting shots...")

        shots = await service.detect_shots(video_path)

        print(f"\n✅ Shot detection completed!")
        print(f"Total shots detected: {len(shots)}\n")

        # 显示前 5 个镜头
        for i, shot in enumerate(shots[:5], 1):
            print(
                f"Shot {i}: {shot['start_time']:.2f}s - {shot['end_time']:.2f}s "
                f"(duration: {shot['duration']:.2f}s)"
            )

        if len(shots) > 5:
            print(f"... and {len(shots) - 5} more shots")

        return True

    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_gemini_asr(video_path: str, language: str = "zh"):
    """测试 Gemini ASR"""
    print("\n" + "=" * 60)
    print("Testing Gemini ASR - Audio Transcription")
    print("=" * 60)

    try:
        service = GeminiASRService()

        print(f"Processing: {video_path}")
        print(f"Language: {language}")
        print("Transcribing...")

        transcript = await service.transcribe_video(video_path, language=language)

        print(f"\n✅ Transcription completed!")
        print(f"Transcript length: {len(transcript)} characters\n")
        print("Transcript:")
        print("-" * 60)
        print(transcript)
        print("-" * 60)

        return True

    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False


async def main():
    """主测试函数"""
    print("\n" + "=" * 60)
    print("Video Intelligence & Gemini ASR Test Suite")
    print("=" * 60)

    # 检查命令行参数
    if len(sys.argv) < 2:
        print("\n使用方法:")
        print("  python test_services.py <video_path> [test_type] [language]")
        print("\n参数:")
        print("  video_path  - 视频文件路径或 GCS URI (gs://...)")
        print("  test_type   - 可选: 'shot', 'asr', 或 'both' (默认: both)")
        print("  language    - 可选: 语言代码，如 'zh', 'en' (默认: zh)")
        print("\n示例:")
        print("  # 测试所有功能")
        print("  python test_services.py /path/to/video.mp4")
        print("\n  # 只测试 shot detection")
        print("  python test_services.py /path/to/video.mp4 shot")
        print("\n  # 只测试 ASR (英文)")
        print("  python test_services.py /path/to/video.mp4 asr en")
        print("\n  # 使用 GCS URI")
        print("  python test_services.py gs://my-bucket/video.mp4")
        sys.exit(1)

    video_path = sys.argv[1]
    test_type = sys.argv[2] if len(sys.argv) > 2 else "both"
    language = sys.argv[3] if len(sys.argv) > 3 else "zh"

    # 验证视频路径
    if not video_path.startswith("gs://"):
        if not Path(video_path).exists():
            print(f"\n❌ Error: Video file not found: {video_path}")
            sys.exit(1)

    results = {}

    # 运行测试
    if test_type in ("shot", "both"):
        results["shot_detection"] = await test_video_intelligence(video_path)

    if test_type in ("asr", "both"):
        results["asr"] = await test_gemini_asr(video_path, language)

    # 总结
    print("\n" + "=" * 60)
    print("Test Summary")
    print("=" * 60)
    for test_name, success in results.items():
        status = "✅ PASSED" if success else "❌ FAILED"
        print(f"{test_name}: {status}")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    asyncio.run(main())
