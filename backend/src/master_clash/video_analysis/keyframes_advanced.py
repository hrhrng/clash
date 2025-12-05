"""
高级关键帧检测模块

结合多种最佳实践算法：
1. 直方图对比（快速基线）
2. 结构相似性 (SSIM)
3. 光流分析（可选）
4. 颜色直方图（HSV）
5. 边缘变化检测
"""

import asyncio
import logging
from pathlib import Path

import cv2
import numpy as np
from skimage.metrics import structural_similarity as ssim

from .models import Keyframe

logger = logging.getLogger(__name__)


class AdvancedKeyframeDetector:
    """
    高级关键帧检测器

    结合多种算法的混合方法：
    - 灰度直方图：快速初筛
    - SSIM：结构相似性
    - HSV 颜色直方图：颜色变化
    - 边缘检测：内容变化
    """

    def __init__(
        self,
        method: str = "hybrid",
        threshold: float = 0.3,
        min_interval: float = 1.0,
        use_color: bool = True,
        use_edges: bool = True,
    ):
        """
        初始化高级关键帧检测器

        Args:
            method: 检测方法
                - "histogram": 灰度直方图（最快）
                - "ssim": 结构相似性（准确）
                - "hybrid": 混合方法（推荐）
                - "color": HSV 颜色直方图
                - "edges": 边缘变化检测
            threshold: 变化阈值 (0-1)，值越小越敏感
            min_interval: 关键帧最小间隔（秒）
            use_color: hybrid 模式下是否考虑颜色
            use_edges: hybrid 模式下是否考虑边缘
        """
        self.method = method
        self.threshold = threshold
        self.min_interval = min_interval
        self.use_color = use_color
        self.use_edges = use_edges

    def calculate_histogram_difference(
        self, frame1: np.ndarray, frame2: np.ndarray
    ) -> float:
        """
        计算灰度直方图差异（快速方法）

        返回: 0-1，0 表示完全相同
        """
        gray1 = cv2.cvtColor(frame1, cv2.COLOR_BGR2GRAY)
        gray2 = cv2.cvtColor(frame2, cv2.COLOR_BGR2GRAY)

        hist1 = cv2.calcHist([gray1], [0], None, [256], [0, 256])
        hist2 = cv2.calcHist([gray2], [0], None, [256], [0, 256])

        cv2.normalize(hist1, hist1, alpha=0, beta=1, norm_type=cv2.NORM_MINMAX)
        cv2.normalize(hist2, hist2, alpha=0, beta=1, norm_type=cv2.NORM_MINMAX)

        correlation = cv2.compareHist(hist1, hist2, cv2.HISTCMP_CORREL)
        return 1 - correlation

    def calculate_ssim(self, frame1: np.ndarray, frame2: np.ndarray) -> float:
        """
        计算结构相似性指数 (SSIM)

        SSIM 考虑亮度、对比度和结构信息，对场景变化更敏感

        返回: 0-1，1 表示完全相同
        """
        # 调整大小以加速计算
        scale = 0.5
        h, w = frame1.shape[:2]
        new_h, new_w = int(h * scale), int(w * scale)

        frame1_resized = cv2.resize(frame1, (new_w, new_h))
        frame2_resized = cv2.resize(frame2, (new_w, new_h))

        # 转换为灰度
        gray1 = cv2.cvtColor(frame1_resized, cv2.COLOR_BGR2GRAY)
        gray2 = cv2.cvtColor(frame2_resized, cv2.COLOR_BGR2GRAY)

        # 计算 SSIM
        score, _ = ssim(gray1, gray2, full=True)

        # 返回差异（1 - 相似度）
        return 1 - score

    def calculate_color_histogram_difference(
        self, frame1: np.ndarray, frame2: np.ndarray
    ) -> float:
        """
        计算 HSV 颜色直方图差异

        对颜色变化更敏感，适合检测场景切换

        返回: 0-1，0 表示完全相同
        """
        # 转换为 HSV
        hsv1 = cv2.cvtColor(frame1, cv2.COLOR_BGR2HSV)
        hsv2 = cv2.cvtColor(frame2, cv2.COLOR_BGR2HSV)

        # 计算 H、S、V 三个通道的直方图
        differences = []
        for i in range(3):
            hist1 = cv2.calcHist([hsv1], [i], None, [256], [0, 256])
            hist2 = cv2.calcHist([hsv2], [i], None, [256], [0, 256])

            cv2.normalize(hist1, hist1, alpha=0, beta=1, norm_type=cv2.NORM_MINMAX)
            cv2.normalize(hist2, hist2, alpha=0, beta=1, norm_type=cv2.NORM_MINMAX)

            correlation = cv2.compareHist(hist1, hist2, cv2.HISTCMP_CORREL)
            differences.append(1 - correlation)

        # 加权平均（H 通道权重更高）
        weights = [0.5, 0.3, 0.2]  # H, S, V
        return sum(d * w for d, w in zip(differences, weights))

    def calculate_edge_difference(self, frame1: np.ndarray, frame2: np.ndarray) -> float:
        """
        计算边缘变化差异

        对内容结构变化敏感，适合检测场景中物体的变化

        返回: 0-1，0 表示完全相同
        """
        # 转换为灰度
        gray1 = cv2.cvtColor(frame1, cv2.COLOR_BGR2GRAY)
        gray2 = cv2.cvtColor(frame2, cv2.COLOR_BGR2GRAY)

        # Canny 边缘检测
        edges1 = cv2.Canny(gray1, 100, 200)
        edges2 = cv2.Canny(gray2, 100, 200)

        # 计算边缘像素差异比例
        diff = cv2.absdiff(edges1, edges2)
        diff_ratio = np.count_nonzero(diff) / diff.size

        return diff_ratio

    def calculate_hybrid_difference(
        self, frame1: np.ndarray, frame2: np.ndarray
    ) -> float:
        """
        混合算法：结合多种方法

        这是推荐的方法，平衡了速度和准确性

        返回: 0-1，0 表示完全相同
        """
        # 1. 快速预筛：直方图（轻量级）
        hist_diff = self.calculate_histogram_difference(frame1, frame2)

        # 如果直方图差异很小，直接判定为相似
        if hist_diff < self.threshold * 0.5:
            return hist_diff

        # 2. 主要判断：SSIM（中等成本，高准确度）
        ssim_diff = self.calculate_ssim(frame1, frame2)

        # 3. 可选：颜色信息
        if self.use_color:
            color_diff = self.calculate_color_histogram_difference(frame1, frame2)
        else:
            color_diff = 0

        # 4. 可选：边缘信息
        if self.use_edges:
            edge_diff = self.calculate_edge_difference(frame1, frame2)
        else:
            edge_diff = 0

        # 加权融合
        weights = {
            "hist": 0.2,
            "ssim": 0.5,
            "color": 0.2 if self.use_color else 0,
            "edges": 0.1 if self.use_edges else 0,
        }

        # 归一化权重
        total_weight = sum(weights.values())
        weights = {k: v / total_weight for k, v in weights.items()}

        combined_diff = (
            weights["hist"] * hist_diff
            + weights["ssim"] * ssim_diff
            + weights["color"] * color_diff
            + weights["edges"] * edge_diff
        )

        return combined_diff

    def calculate_frame_difference(self, frame1: np.ndarray, frame2: np.ndarray) -> float:
        """
        根据选择的方法计算帧差异

        返回: 0-1，0 表示完全相同
        """
        if self.method == "histogram":
            return self.calculate_histogram_difference(frame1, frame2)
        elif self.method == "ssim":
            return self.calculate_ssim(frame1, frame2)
        elif self.method == "color":
            return self.calculate_color_histogram_difference(frame1, frame2)
        elif self.method == "edges":
            return self.calculate_edge_difference(frame1, frame2)
        elif self.method == "hybrid":
            return self.calculate_hybrid_difference(frame1, frame2)
        else:
            raise ValueError(f"Unknown method: {self.method}")

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
            f"Processing video with {self.method} method: {frame_count} frames at {fps} FPS"
        )

        keyframes = []
        prev_frame = None
        prev_keyframe_idx = -min_interval_frames

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
                        frame,
                        frame_idx,
                        current_time,
                        output_dir if save_images else None,
                        1.0,
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
                        frame,
                        frame_idx,
                        current_time,
                        output_dir if save_images else None,
                        difference,
                    )
                    keyframes.append(keyframe)
                    prev_keyframe_idx = frame_idx

                    logger.debug(
                        f"Keyframe detected at {current_time:.2f}s "
                        f"(frame {frame_idx}, diff: {difference:.3f})"
                    )

                    # 检查最大数量
                    if max_keyframes and len(keyframes) >= max_keyframes:
                        logger.info(f"Reached maximum keyframes limit: {max_keyframes}")
                        break

                prev_frame = frame
                frame_idx += 1

        finally:
            cap.release()

        logger.info(f"Detected {len(keyframes)} keyframes using {self.method} method")
        return keyframes

    def _save_keyframe(
        self,
        frame: np.ndarray,
        frame_idx: int,
        timestamp: float,
        output_dir: str | None,
        score: float,
    ) -> Keyframe:
        """保存关键帧"""
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
        """异步检测关键帧"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, self.detect_keyframes, video_path, output_dir, max_keyframes, save_images
        )


# 便捷函数
def detect_keyframes_fast(video_path: str, **kwargs) -> list[Keyframe]:
    """快速模式（仅直方图）"""
    detector = AdvancedKeyframeDetector(method="histogram", threshold=0.3)
    return detector.detect_keyframes(video_path, **kwargs)


def detect_keyframes_accurate(video_path: str, **kwargs) -> list[Keyframe]:
    """准确模式（SSIM）"""
    detector = AdvancedKeyframeDetector(method="ssim", threshold=0.15)
    return detector.detect_keyframes(video_path, **kwargs)


def detect_keyframes_balanced(video_path: str, **kwargs) -> list[Keyframe]:
    """平衡模式（混合算法，推荐）"""
    detector = AdvancedKeyframeDetector(
        method="hybrid", threshold=0.3, use_color=True, use_edges=True
    )
    return detector.detect_keyframes(video_path, **kwargs)
