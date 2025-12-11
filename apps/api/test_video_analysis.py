"""
视频分析模块测试脚本

演示如何使用视频分析模块进行全面的视频理解
"""

import asyncio
import json
import sys
from pathlib import Path

# 添加 src 到路径
sys.path.insert(0, str(Path(__file__).parent / "src"))

from master_clash.video_analysis import (
    AudioTranscriber,
    GeminiVideoAnalyzer,
    KeyframeDetector,
    SubtitleExtractor,
    VideoAnalysisConfig,
    VideoAnalysisOrchestrator,
)


async def test_asr_only(video_path: str):
    """测试 ASR 功能"""
    print("\n=== 测试 ASR (语音识别) ===\n")

    transcriber = AudioTranscriber()

    # 转录视频
    segments = await transcriber.transcribe_video(video_path)

    print(f"转录了 {len(segments)} 个片段：\n")
    for i, seg in enumerate(segments[:5], 1):  # 显示前 5 个片段
        print(f"{i}. [{seg.start_time:.2f}s - {seg.end_time:.2f}s] {seg.text}")

    # 导出为 SRT
    output_dir = Path(video_path).parent / "test_output"
    output_dir.mkdir(exist_ok=True)
    transcriber.export_to_srt(segments, str(output_dir / "transcription.srt"))
    print(f"\n✓ SRT 文件已导出到: {output_dir / 'transcription.srt'}")


async def test_keyframe_detection(video_path: str):
    """测试关键帧检测"""
    print("\n=== 测试关键帧检测 ===\n")

    detector = KeyframeDetector(threshold=30.0, min_interval=1.0)

    # 检测关键帧
    output_dir = Path(video_path).parent / "test_output" / "keyframes"
    keyframes = await detector.detect_keyframes_async(
        video_path, output_dir=str(output_dir), max_keyframes=10, save_images=True
    )

    print(f"检测到 {len(keyframes)} 个关键帧：\n")
    for i, kf in enumerate(keyframes[:5], 1):
        print(f"{i}. 时间戳: {kf.timestamp:.2f}s, 帧号: {kf.frame_number}, 评分: {kf.score:.2f}")

    print(f"\n✓ 关键帧图像已保存到: {output_dir}")


async def test_gemini_video_analysis(video_path: str):
    """测试 Gemini 视频理解"""
    print("\n=== 测试 Gemini 视频理解 ===\n")

    analyzer = GeminiVideoAnalyzer(model="gemini-2.5-pro")

    # 分析视频
    print("正在分析视频（这可能需要一些时间）...")
    insights = await analyzer.analyze_video(video_path)

    print(f"\n视频摘要:\n{insights.summary}\n")

    if insights.objects_detected:
        print(f"检测到的物体: {', '.join(insights.objects_detected[:10])}\n")

    if insights.activities:
        print(f"识别到的活动: {', '.join(insights.activities[:5])}\n")

    if insights.key_moments:
        print("关键时刻:")
        for i, moment in enumerate(insights.key_moments[:3], 1):
            print(f"{i}. {moment.get('timestamp', 'N/A')}: {moment.get('description', 'N/A')}")


async def test_full_analysis(video_path: str):
    """测试完整的视频分析流程"""
    print("\n=== 测试完整视频分析 ===\n")

    # 配置
    config = VideoAnalysisConfig(
        enable_asr=True,
        enable_subtitle_extraction=True,
        enable_keyframe_detection=True,
        enable_gemini_analysis=True,
        asr_language="auto",
        keyframe_threshold=0.3,
        max_keyframes=20,
        gemini_model="gemini-2.5-pro",
    )

    # 创建编排器
    orchestrator = VideoAnalysisOrchestrator(config)

    # 运行分析
    output_dir = Path(video_path).parent / "test_output" / "full_analysis"
    print(f"开始分析，输出目录: {output_dir}\n")

    result = await orchestrator.analyze_video(video_path, str(output_dir))

    # 显示结果
    print(f"\n✓ 分析完成！处理时间: {result.processing_time_seconds:.2f}秒\n")

    print("=" * 60)
    print("视频元数据:")
    print(f"  时长: {result.metadata.duration:.2f}秒")
    print(f"  分辨率: {result.metadata.width}x{result.metadata.height}")
    print(f"  帧率: {result.metadata.fps:.2f} FPS")
    print(f"  文件大小: {result.metadata.size_bytes / 1024 / 1024:.2f} MB")

    if result.transcription:
        print(f"\n转录: {len(result.transcription)} 个片段")
        total_text = " ".join([seg.text for seg in result.transcription])
        print(f"  文本预览: {total_text[:200]}...")

    if result.subtitles:
        print(f"\n字幕: {len(result.subtitles)} 个轨道")
        for track in result.subtitles:
            print(f"  - {track.language}: {len(track.segments)} 个片段")

    if result.keyframes:
        print(f"\n关键帧: {len(result.keyframes)} 个")

    if result.gemini_insights:
        print(f"\nGemini 分析:")
        print(f"  摘要: {result.gemini_insights.summary[:200]}...")
        print(f"  物体: {len(result.gemini_insights.objects_detected)} 个")
        print(f"  场景: {len(result.gemini_insights.scenes)} 个")
        print(f"  活动: {len(result.gemini_insights.activities)} 个")

    if result.tags:
        print(f"\n标签: {', '.join(result.tags[:10])}")

    if result.errors:
        print(f"\n⚠️  错误: {len(result.errors)} 个")
        for error in result.errors:
            print(f"  - {error}")

    print("\n" + "=" * 60)
    print(f"完整结果已保存到: {output_dir / 'analysis_result.json'}")


async def main():
    """主函数"""
    print("=" * 60)
    print("视频分析模块测试")
    print("=" * 60)

    # 从命令行获取视频路径
    if len(sys.argv) < 2:
        print("\n使用方法: python test_video_analysis.py <视频文件路径> [测试类型]\n")
        print("测试类型:")
        print("  asr      - 仅测试语音识别")
        print("  keyframe - 仅测试关键帧检测")
        print("  gemini   - 仅测试 Gemini 视频理解")
        print("  full     - 完整分析（默认）")
        print("\n示例:")
        print("  python test_video_analysis.py video.mp4")
        print("  python test_video_analysis.py video.mp4 asr")
        return

    video_path = sys.argv[1]
    test_type = sys.argv[2] if len(sys.argv) > 2 else "full"

    # 检查文件是否存在
    if not Path(video_path).exists():
        print(f"\n❌ 错误: 找不到视频文件: {video_path}")
        return

    print(f"\n视频文件: {video_path}")
    print(f"测试类型: {test_type}\n")

    try:
        if test_type == "asr":
            await test_asr_only(video_path)
        elif test_type == "keyframe":
            await test_keyframe_detection(video_path)
        elif test_type == "gemini":
            await test_gemini_video_analysis(video_path)
        elif test_type == "full":
            await test_full_analysis(video_path)
        else:
            print(f"❌ 未知的测试类型: {test_type}")
            return

        print("\n✅ 测试完成！")

    except Exception as e:
        print(f"\n❌ 测试失败: {e}")
        import traceback

        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())
