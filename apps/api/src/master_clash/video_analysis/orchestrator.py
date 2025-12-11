"""
视频分析编排器

整合 ASR、字幕提取、关键帧检测和 Gemini 视频理解，
提供统一的视频分析接口
"""

import asyncio
import logging
import time
from pathlib import Path

import cv2

from .asr import AudioTranscriber
from .gemini_video import GeminiVideoAnalyzer
from .keyframes import KeyframeDetector
from .models import VideoAnalysisConfig, VideoAnalysisResult, VideoMetadata
from .subtitles import SubtitleExtractor

logger = logging.getLogger(__name__)


class VideoAnalysisOrchestrator:
    """视频分析编排器 - 协调所有分析组件"""

    def __init__(self, config: VideoAnalysisConfig | None = None):
        """
        初始化编排器

        Args:
            config: 视频分析配置
        """
        self.config = config or VideoAnalysisConfig()

        # 初始化各个组件
        self.asr = AudioTranscriber() if self.config.enable_asr else None
        self.subtitle_extractor = SubtitleExtractor() if self.config.enable_subtitle_extraction else None
        self.keyframe_detector = (
            KeyframeDetector(
                threshold=self.config.keyframe_threshold * 255,
                min_interval=self.config.keyframe_interval or 1.0,
            )
            if self.config.enable_keyframe_detection
            else None
        )
        self.gemini_analyzer = (
            GeminiVideoAnalyzer(model=self.config.gemini_model)
            if self.config.enable_gemini_analysis
            else None
        )

        logger.info("VideoAnalysisOrchestrator initialized")

    def extract_video_metadata(self, video_path: str) -> VideoMetadata:
        """
        提取视频元数据

        Args:
            video_path: 视频文件路径

        Returns:
            视频元数据
        """
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise RuntimeError(f"Failed to open video: {video_path}")

        try:
            fps = cap.get(cv2.CAP_PROP_FPS)
            frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            fourcc = int(cap.get(cv2.CAP_PROP_FOURCC))

            # 计算时长
            duration = frame_count / fps if fps > 0 else 0.0

            # 获取文件大小
            file_size = Path(video_path).stat().st_size

            # 解码 fourcc
            codec = "".join([chr((fourcc >> 8 * i) & 0xFF) for i in range(4)])

            return VideoMetadata(
                duration=duration,
                fps=fps,
                width=width,
                height=height,
                codec=codec,
                size_bytes=file_size,
                has_audio=True,  # 假设有音频，ASR 会检测
            )

        finally:
            cap.release()

    async def analyze_video(
        self, video_path: str, output_dir: str | None = None
    ) -> VideoAnalysisResult:
        """
        执行完整的视频分析

        Args:
            video_path: 视频文件路径
            output_dir: 输出目录

        Returns:
            综合视频分析结果
        """
        start_time = time.time()
        logger.info(f"Starting comprehensive video analysis: {video_path}")

        # 准备输出目录
        video_path_obj = Path(video_path)
        if output_dir is None:
            output_dir = str(video_path_obj.parent / f"{video_path_obj.stem}_analysis")

        output_dir_obj = Path(output_dir)
        output_dir_obj.mkdir(parents=True, exist_ok=True)

        # 提取元数据
        try:
            metadata = self.extract_video_metadata(video_path)
            logger.info(
                f"Video metadata: {metadata.duration:.2f}s, {metadata.fps:.2f}fps, {metadata.width}x{metadata.height}"
            )
        except Exception as e:
            logger.error(f"Failed to extract metadata: {e}")
            return VideoAnalysisResult(
                video_path=video_path,
                metadata=VideoMetadata(duration=0, fps=0, width=0, height=0),
                errors=[f"Metadata extraction failed: {str(e)}"],
            )

        # 初始化结果对象
        result = VideoAnalysisResult(video_path=video_path, metadata=metadata, errors=[])

        # 并行执行独立的分析任务
        tasks = []

        # 任务 1: ASR 转录
        if self.config.enable_asr and self.asr:
            tasks.append(self._run_asr(video_path))

        # 任务 2: 字幕提取
        if self.config.enable_subtitle_extraction and self.subtitle_extractor:
            tasks.append(self._run_subtitle_extraction(video_path, output_dir))

        # 任务 3: 关键帧检测
        if self.config.enable_keyframe_detection and self.keyframe_detector:
            keyframes_dir = (
                self.config.keyframes_output_dir
                if self.config.keyframes_output_dir
                else str(output_dir_obj / "keyframes")
            )
            tasks.append(
                self._run_keyframe_detection(
                    video_path, keyframes_dir, self.config.save_keyframes
                )
            )

        # 等待所有独立任务完成
        if tasks:
            results = await asyncio.gather(*tasks, return_exceptions=True)

            # 处理 ASR 结果
            if self.config.enable_asr:
                asr_result = results[0]
                if isinstance(asr_result, Exception):
                    logger.error(f"ASR failed: {asr_result}")
                    result.errors.append(f"ASR error: {str(asr_result)}")
                else:
                    result.transcription = asr_result
                    logger.info(f"ASR completed: {len(asr_result)} segments")

            # 处理字幕提取结果
            if self.config.enable_subtitle_extraction:
                subtitle_result = results[1] if len(results) > 1 else None
                if isinstance(subtitle_result, Exception):
                    logger.error(f"Subtitle extraction failed: {subtitle_result}")
                    result.errors.append(f"Subtitle extraction error: {str(subtitle_result)}")
                elif subtitle_result:
                    result.subtitles = subtitle_result
                    logger.info(f"Subtitle extraction completed: {len(subtitle_result)} tracks")

            # 处理关键帧检测结果
            if self.config.enable_keyframe_detection:
                keyframe_result = results[2] if len(results) > 2 else results[1] if len(results) == 2 and not self.config.enable_subtitle_extraction else results[0] if len(results) == 1 and not self.config.enable_asr and not self.config.enable_subtitle_extraction else None
                if isinstance(keyframe_result, Exception):
                    logger.error(f"Keyframe detection failed: {keyframe_result}")
                    result.errors.append(f"Keyframe detection error: {str(keyframe_result)}")
                elif keyframe_result:
                    result.keyframes = keyframe_result
                    logger.info(f"Keyframe detection completed: {len(keyframe_result)} keyframes")

        # 任务 4: Gemini 视频理解（依赖于其他任务可选）
        if self.config.enable_gemini_analysis and self.gemini_analyzer:
            try:
                # Gemini 视频分析
                gemini_result = await self.gemini_analyzer.analyze_video(
                    video_path, custom_prompt=self.config.gemini_prompt
                )
                result.gemini_insights = gemini_result
                logger.info("Gemini video analysis completed")

                # 如果有关键帧，也分析关键帧
                if result.keyframes and len(result.keyframes) > 0:
                    logger.info("Analyzing keyframes with Gemini...")
                    await self.gemini_analyzer.analyze_keyframes(result.keyframes)
                    logger.info("Keyframe analysis completed")

            except Exception as e:
                logger.error(f"Gemini analysis failed: {e}")
                result.errors.append(f"Gemini analysis error: {str(e)}")

        # 生成综合摘要
        result.summary = self._generate_summary(result)

        # 生成标签
        result.tags = self._generate_tags(result)

        # 计算处理时间
        result.processing_time_seconds = time.time() - start_time
        logger.info(f"Video analysis completed in {result.processing_time_seconds:.2f}s")

        # 保存结果
        if self.config.save_transcription:
            self._save_results(result, output_dir)

        return result

    async def _run_asr(self, video_path: str):
        """运行 ASR 转录"""
        logger.info("Running ASR transcription...")
        return await self.asr.transcribe_video(
            video_path, language=self.config.asr_language if self.config.asr_language != "auto" else None
        )

    async def _run_subtitle_extraction(self, video_path: str, output_dir: str):
        """运行字幕提取"""
        logger.info("Extracting subtitles...")
        return await self.subtitle_extractor.extract_all_subtitles(video_path, output_dir)

    async def _run_keyframe_detection(self, video_path: str, output_dir: str, save_images: bool):
        """运行关键帧检测"""
        logger.info("Detecting keyframes...")
        return await self.keyframe_detector.detect_keyframes_async(
            video_path,
            output_dir=output_dir,
            max_keyframes=self.config.max_keyframes,
            save_images=save_images,
        )

    def _generate_summary(self, result: VideoAnalysisResult) -> str:
        """生成综合摘要"""
        parts = []

        # 基本信息
        parts.append(
            f"视频时长: {result.metadata.duration:.2f}秒, "
            f"分辨率: {result.metadata.width}x{result.metadata.height}"
        )

        # Gemini 摘要
        if result.gemini_insights:
            parts.append(f"\n\n内容摘要: {result.gemini_insights.summary}")

        # 转录信息
        if result.transcription:
            total_text = " ".join([seg.text for seg in result.transcription])
            parts.append(f"\n\n转录文本 ({len(result.transcription)} 个片段): {total_text[:200]}...")

        # 关键帧信息
        if result.keyframes:
            parts.append(f"\n\n检测到 {len(result.keyframes)} 个关键帧")

        return "".join(parts)

    def _generate_tags(self, result: VideoAnalysisResult) -> list[str]:
        """生成标签"""
        tags = []

        if result.gemini_insights:
            # 从物体检测添加标签
            tags.extend(result.gemini_insights.objects_detected[:10])

            # 从活动添加标签
            tags.extend(result.gemini_insights.activities[:5])

        # 去重
        return list(set(tags))

    def _save_results(self, result: VideoAnalysisResult, output_dir: str) -> None:
        """保存分析结果"""
        output_dir_obj = Path(output_dir)
        output_dir_obj.mkdir(parents=True, exist_ok=True)

        # 保存转录
        if result.transcription and self.asr:
            if self.config.transcription_format == "json":
                self.asr.export_to_json(
                    result.transcription, str(output_dir_obj / "transcription.json")
                )
            elif self.config.transcription_format == "srt":
                self.asr.export_to_srt(result.transcription, str(output_dir_obj / "transcription.srt"))
            elif self.config.transcription_format == "vtt":
                self.asr.export_to_vtt(result.transcription, str(output_dir_obj / "transcription.vtt"))

        # 保存完整结果为 JSON
        import json

        result_dict = result.model_dump()
        with open(output_dir_obj / "analysis_result.json", "w", encoding="utf-8") as f:
            json.dump(result_dict, f, ensure_ascii=False, indent=2, default=str)

        logger.info(f"Results saved to {output_dir}")
