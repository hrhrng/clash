"""
关键帧检测模块

使用场景检测和视觉特征分析提取视频关键帧
"""

import asyncio
import hashlib
import logging
from pathlib import Path

import cv2
import numpy as np

from .models import Keyframe

logger = logging.getLogger(__name__)


class KeyframeDetector:
    """关键帧检测器"""

    def __init__(self, threshold: float = 30.0, min_interval: float = 1.0):
        """
        初始化关键帧检测器

        Args:
            threshold: 场景变化阈值（0-255），值越小越敏感
            min_interval: 关键帧之间的最小间隔（秒）
        """
        self.threshold = threshold
        self.min_interval = min_interval

    def calculate_frame_difference(self, frame1: np.ndarray, frame2: np.ndarray) -> float:
        """
        计算两帧之间的差异

        Args:
            frame1: 第一帧
            frame2: 第二帧

        Returns:
            差异分数（0-255）
        """
        # 转换为灰度
        gray1 = cv2.cvtColor(frame1, cv2.COLOR_BGR2GRAY)
        gray2 = cv2.cvtColor(frame2, cv2.COLOR_BGR2GRAY)

        # 计算直方图
        hist1 = cv2.calcHist([gray1], [0], None, [256], [0, 256])
        hist2 = cv2.calcHist([gray2], [0], None, [256], [0, 256])

        # 归一化
        cv2.normalize(hist1, hist1, alpha=0, beta=1, norm_type=cv2.NORM_MINMAX)
        cv2.normalize(hist2, hist2, alpha=0, beta=1, norm_type=cv2.NORM_MINMAX)

        # 计算相关性（返回值范围 0-1，1 表示完全相同）
        correlation = cv2.compareHist(hist1, hist2, cv2.HISTCMP_CORREL)

        # 转换为差异分数（0-255）
        difference = (1 - correlation) * 255

        return float(difference)

    def detect_keyframes(
        self,
        video_path: str,
        output_dir: str | None = None,
        max_keyframes: int | None = None,
        save_images: bool = True,
    ) -> list[Keyframe]:
        """
        检测视频中的关键帧

        Args:
            video_path: 视频文件路径
            output_dir: 关键帧保存目录
            max_keyframes: 最大关键帧数量
            save_images: 是否保存关键帧图像

        Returns:
            关键帧列表
        """
        video_path_obj = Path(video_path)
        if output_dir is None:
            output_dir = str(video_path_obj.parent / f"{video_path_obj.stem}_keyframes")

        if save_images:
            output_dir_obj = Path(output_dir)
            output_dir_obj.mkdir(parents=True, exist_ok=True)

        # 打开视频
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise RuntimeError(f"Failed to open video: {video_path}")

        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        min_interval_frames = int(fps * self.min_interval)

        logger.info(
            f"Processing video: {frame_count} frames at {fps} FPS (min interval: {min_interval_frames} frames)"
        )

        keyframes = []
        prev_frame = None
        prev_keyframe_idx = -min_interval_frames  # 确保第一帧被选中

        frame_idx = 0

        try:
            while True:
                ret, frame = cap.read()
                if not ret:
                    break

                current_time = frame_idx / fps

                # 第一帧总是关键帧
                if frame_idx == 0:
                    keyframe = self._save_keyframe(
                        frame, frame_idx, current_time, output_dir if save_images else None, 255.0
                    )
                    keyframes.append(keyframe)
                    prev_frame = frame
                    prev_keyframe_idx = frame_idx
                    frame_idx += 1
                    continue

                # 检查间隔
                if frame_idx - prev_keyframe_idx < min_interval_frames:
                    prev_frame = frame
                    frame_idx += 1
                    continue

                # 计算差异
                difference = self.calculate_frame_difference(prev_frame, frame)

                # 场景变化检测
                if difference > self.threshold:
                    keyframe = self._save_keyframe(
                        frame, frame_idx, current_time, output_dir if save_images else None, difference
                    )
                    keyframes.append(keyframe)
                    prev_keyframe_idx = frame_idx

                    logger.debug(
                        f"Keyframe detected at {current_time:.2f}s (frame {frame_idx}, difference: {difference:.2f})"
                    )

                    # 检查最大数量
                    if max_keyframes and len(keyframes) >= max_keyframes:
                        logger.info(f"Reached maximum keyframes limit: {max_keyframes}")
                        break

                prev_frame = frame
                frame_idx += 1

        finally:
            cap.release()

        logger.info(f"Detected {len(keyframes)} keyframes")
        return keyframes

    def _save_keyframe(
        self,
        frame: np.ndarray,
        frame_idx: int,
        timestamp: float,
        output_dir: str | None,
        score: float,
    ) -> Keyframe:
        """
        保存关键帧

        Args:
            frame: 帧图像
            frame_idx: 帧索引
            timestamp: 时间戳（秒）
            output_dir: 输出目录
            score: 关键帧评分

        Returns:
            关键帧对象
        """
        image_path = ""

        if output_dir:
            output_dir_obj = Path(output_dir)
            filename = f"keyframe_{frame_idx:06d}_{timestamp:.2f}s.jpg"
            image_path = str(output_dir_obj / filename)

            # 保存图像
            cv2.imwrite(image_path, frame, [cv2.IMWRITE_JPEG_QUALITY, 90])

        return Keyframe(
            timestamp=timestamp, frame_number=frame_idx, image_path=image_path, score=score
        )

    async def detect_keyframes_async(
        self,
        video_path: str,
        output_dir: str | None = None,
        max_keyframes: int | None = None,
        save_images: bool = True,
    ) -> list[Keyframe]:
        """
        异步检测关键帧（在线程池中运行）

        Args:
            video_path: 视频文件路径
            output_dir: 关键帧保存目录
            max_keyframes: 最大关键帧数量
            save_images: 是否保存关键帧图像

        Returns:
            关键帧列表
        """
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, self.detect_keyframes, video_path, output_dir, max_keyframes, save_images
        )

    def extract_uniform_keyframes(
        self, video_path: str, num_keyframes: int = 10, output_dir: str | None = None
    ) -> list[Keyframe]:
        """
        均匀提取关键帧（不基于场景变化）

        Args:
            video_path: 视频文件路径
            num_keyframes: 要提取的关键帧数量
            output_dir: 关键帧保存目录

        Returns:
            关键帧列表
        """
        video_path_obj = Path(video_path)
        if output_dir is None:
            output_dir = str(video_path_obj.parent / f"{video_path_obj.stem}_keyframes_uniform")

        output_dir_obj = Path(output_dir)
        output_dir_obj.mkdir(parents=True, exist_ok=True)

        # 打开视频
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise RuntimeError(f"Failed to open video: {video_path}")

        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        # 计算采样间隔
        interval = max(1, frame_count // (num_keyframes + 1))

        logger.info(
            f"Extracting {num_keyframes} uniform keyframes (interval: {interval} frames)"
        )

        keyframes = []

        try:
            for i in range(1, num_keyframes + 1):
                frame_idx = i * interval
                if frame_idx >= frame_count:
                    break

                # 跳转到指定帧
                cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
                ret, frame = cap.read()

                if not ret:
                    logger.warning(f"Failed to read frame {frame_idx}")
                    continue

                timestamp = frame_idx / fps
                keyframe = self._save_keyframe(frame, frame_idx, timestamp, output_dir, 0.0)
                keyframes.append(keyframe)

        finally:
            cap.release()

        logger.info(f"Extracted {len(keyframes)} uniform keyframes")
        return keyframes

    async def extract_uniform_keyframes_async(
        self, video_path: str, num_keyframes: int = 10, output_dir: str | None = None
    ) -> list[Keyframe]:
        """
        异步均匀提取关键帧

        Args:
            video_path: 视频文件路径
            num_keyframes: 要提取的关键帧数量
            output_dir: 关键帧保存目录

        Returns:
            关键帧列表
        """
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, self.extract_uniform_keyframes, video_path, num_keyframes, output_dir
        )
