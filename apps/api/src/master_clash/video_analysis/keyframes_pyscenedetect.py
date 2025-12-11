"""
使用 PySceneDetect 进行关键帧检测

PySceneDetect 是业界标准的场景检测库，提供多种检测算法：
- ContentDetector: 基于内容的快速检测（推荐）
- ThresholdDetector: 基于阈值的简单检测
- AdaptiveDetector: 自适应检测，适应不同场景
"""

import asyncio
import logging
from pathlib import Path

import cv2
from scenedetect import detect, ContentDetector, AdaptiveDetector, ThresholdDetector

from .models import Keyframe

logger = logging.getLogger(__name__)


class PySceneDetectKeyframeDetector:
    """
    基于 PySceneDetect 的关键帧检测器

    PySceneDetect 是一个成熟的、经过充分测试的场景检测库，
    提供了多种高质量的检测算法
    """

    def __init__(
        self,
        detector_type: str = "content",
        threshold: float = 27.0,
        min_scene_len: float = 1.0,
        adaptive_threshold: float = 3.0,
    ):
        """
        初始化检测器

        Args:
            detector_type: 检测器类型
                - "content": 内容检测器（推荐，快速且准确）
                - "adaptive": 自适应检测器（适应性强）
                - "threshold": 阈值检测器（最快，适合渐变少的视频）
            threshold: 检测阈值
                - content: 默认 27.0，范围 15-100
                - adaptive: 默认 3.0
                - threshold: 默认 12.0
            min_scene_len: 场景最小长度（秒）
            adaptive_threshold: 自适应检测器的阈值
        """
        self.detector_type = detector_type
        self.threshold = threshold
        self.min_scene_len = min_scene_len
        self.adaptive_threshold = adaptive_threshold

    def _create_detector(self):
        """创建检测器"""
        if self.detector_type == "content":
            return ContentDetector(threshold=self.threshold, min_scene_len=self.min_scene_len)
        elif self.detector_type == "adaptive":
            return AdaptiveDetector(
                adaptive_threshold=self.adaptive_threshold,
                min_scene_len=self.min_scene_len,
                window_width=2,
            )
        elif self.detector_type == "threshold":
            return ThresholdDetector(threshold=self.threshold, min_scene_len=self.min_scene_len)
        else:
            raise ValueError(f"Unknown detector type: {self.detector_type}")

    def detect_keyframes(
        self,
        video_path: str,
        output_dir: str | None = None,
        max_keyframes: int | None = None,
        save_images: bool = True,
    ) -> list[Keyframe]:
        """
        检测视频中的关键帧（场景切换点）

        Args:
            video_path: 视频文件路径
            output_dir: 关键帧保存目录
            max_keyframes: 最大关键帧数量
            save_images: 是否保存关键帧图像

        Returns:
            关键帧列表
        """
        logger.info(f"Detecting scenes using PySceneDetect ({self.detector_type} detector)")

        # 创建检测器
        detector = self._create_detector()

        # 检测场景
        scene_list = detect(video_path, detector)

        logger.info(f"Detected {len(scene_list)} scenes")

        # 转换为关键帧
        keyframes = []

        # 打开视频以提取帧
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise RuntimeError(f"Failed to open video: {video_path}")

        try:
            fps = cap.get(cv2.CAP_PROP_FPS)

            # 准备输出目录
            video_path_obj = Path(video_path)
            if output_dir is None:
                output_dir = str(
                    video_path_obj.parent / f"{video_path_obj.stem}_keyframes_pyscene"
                )

            if save_images:
                output_dir_obj = Path(output_dir)
                output_dir_obj.mkdir(parents=True, exist_ok=True)

            # 提取每个场景的第一帧作为关键帧
            for i, scene in enumerate(scene_list):
                if max_keyframes and i >= max_keyframes:
                    logger.info(f"Reached max keyframes limit: {max_keyframes}")
                    break

                # 获取场景起始帧
                start_frame = scene[0].get_frames()
                start_time = scene[0].get_seconds()

                # 跳转到该帧
                cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
                ret, frame = cap.read()

                if not ret:
                    logger.warning(f"Failed to read frame {start_frame}")
                    continue

                # 保存关键帧
                image_path = ""
                if save_images:
                    output_dir_obj = Path(output_dir)
                    filename = f"keyframe_{start_frame:06d}_{start_time:.2f}s.jpg"
                    image_path = str(output_dir_obj / filename)
                    cv2.imwrite(image_path, frame, [cv2.IMWRITE_JPEG_QUALITY, 90])

                keyframe = Keyframe(
                    timestamp=start_time,
                    frame_number=start_frame,
                    image_path=image_path,
                    score=1.0,  # PySceneDetect 不提供具体分数
                )
                keyframes.append(keyframe)

        finally:
            cap.release()

        logger.info(f"Extracted {len(keyframes)} keyframes")
        return keyframes

    async def detect_keyframes_async(
        self,
        video_path: str,
        output_dir: str | None = None,
        max_keyframes: int | None = None,
        save_images: bool = True,
    ) -> list[Keyframe]:
        """异步检测关键帧"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, self.detect_keyframes, video_path, output_dir, max_keyframes, save_images
        )


# 便捷函数
def detect_scenes_fast(video_path: str, **kwargs) -> list[Keyframe]:
    """
    快速场景检测（使用 ContentDetector）

    适合大多数视频，提供良好的速度和准确性平衡
    """
    detector = PySceneDetectKeyframeDetector(detector_type="content", threshold=27.0)
    return detector.detect_keyframes(video_path, **kwargs)


def detect_scenes_sensitive(video_path: str, **kwargs) -> list[Keyframe]:
    """
    敏感场景检测（低阈值）

    能检测到更微小的场景变化，适合需要更多关键帧的场景
    """
    detector = PySceneDetectKeyframeDetector(detector_type="content", threshold=15.0)
    return detector.detect_keyframes(video_path, **kwargs)


def detect_scenes_adaptive(video_path: str, **kwargs) -> list[Keyframe]:
    """
    自适应场景检测

    适合光照变化较大或复杂的视频
    """
    detector = PySceneDetectKeyframeDetector(detector_type="adaptive", adaptive_threshold=3.0)
    return detector.detect_keyframes(video_path, **kwargs)
