"""
基于 CLIP 的语义级关键帧检测

使用 OpenAI CLIP 模型提取视频帧的语义特征，
通过余弦距离曲线的峰值检测场景切换。

这是最先进的方法之一，能够理解场景的语义变化，
而不仅仅是像素级的视觉变化。
"""

import asyncio
import logging
from pathlib import Path

import cv2
import numpy as np
import torch
from PIL import Image
from scipy.signal import find_peaks
from transformers import CLIPModel, CLIPProcessor

from .models import Keyframe

logger = logging.getLogger(__name__)


class CLIPKeyframeDetector:
    """
    基于 CLIP 的关键帧检测器

    优势：
    - 语义级别的场景理解
    - 对光照、角度变化鲁棒
    - 能识别内容相似但位置不同的场景
    - 适合复杂视频（电影、纪录片等）

    原理：
    1. 使用 CLIP 提取每帧的视觉嵌入
    2. 计算相邻帧嵌入的余弦距离
    3. 使用峰值检测算法找到距离曲线的峰值
    4. 峰值对应场景切换点
    """

    def __init__(
        self,
        model_name: str = "openai/clip-vit-base-patch32",
        distance_threshold: float = 0.3,
        peak_prominence: float = 0.1,
        min_interval: float = 1.0,
        frame_sample_rate: int = 1,
        device: str = "auto",
    ):
        """
        初始化 CLIP 关键帧检测器

        Args:
            model_name: CLIP 模型名称
                - "openai/clip-vit-base-patch32": 基础版（推荐，快速）
                - "openai/clip-vit-large-patch14": 大模型（更准确，较慢）
            distance_threshold: 距离阈值（0-2），超过此值认为场景变化
            peak_prominence: 峰值显著性（0-1），控制峰值检测灵敏度
            min_interval: 最小场景间隔（秒）
            frame_sample_rate: 帧采样率（每 N 帧处理一次，加速处理）
            device: 设备 ("auto", "cuda", "cpu")
        """
        self.model_name = model_name
        self.distance_threshold = distance_threshold
        self.peak_prominence = peak_prominence
        self.min_interval = min_interval
        self.frame_sample_rate = frame_sample_rate

        # 设置设备
        if device == "auto":
            self.device = "cuda" if torch.cuda.is_available() else "cpu"
        else:
            self.device = device

        logger.info(f"Initializing CLIP model: {model_name} on {self.device}")

        # 加载 CLIP 模型
        self.model = CLIPModel.from_pretrained(model_name).to(self.device)
        self.processor = CLIPProcessor.from_pretrained(model_name)

        # 设置为评估模式
        self.model.eval()

        logger.info("CLIP model loaded successfully")

    @torch.no_grad()
    def extract_frame_embedding(self, frame: np.ndarray) -> np.ndarray:
        """
        提取单帧的 CLIP 嵌入向量

        Args:
            frame: OpenCV 格式的帧（BGR）

        Returns:
            归一化的嵌入向量
        """
        # 转换为 PIL Image (RGB)
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        pil_image = Image.fromarray(frame_rgb)

        # 预处理
        inputs = self.processor(images=pil_image, return_tensors="pt")
        inputs = {k: v.to(self.device) for k, v in inputs.items()}

        # 提取图像特征
        image_features = self.model.get_image_features(**inputs)

        # 归一化（用于余弦相似度计算）
        image_features = image_features / image_features.norm(dim=-1, keepdim=True)

        return image_features.cpu().numpy()[0]

    def calculate_cosine_distance(self, embedding1: np.ndarray, embedding2: np.ndarray) -> float:
        """
        计算两个嵌入向量的余弦距离

        Returns:
            0-2 之间的距离，0 表示完全相同，2 表示完全相反
        """
        # 余弦相似度：[-1, 1]
        cosine_similarity = np.dot(embedding1, embedding2)

        # 转换为距离：[0, 2]
        cosine_distance = 1 - cosine_similarity

        return float(cosine_distance)

    def extract_all_embeddings(self, video_path: str) -> tuple[list[np.ndarray], list[int], float]:
        """
        提取视频所有帧的嵌入向量

        Returns:
            (embeddings, frame_indices, fps)
        """
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise RuntimeError(f"Failed to open video: {video_path}")

        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        embeddings = []
        frame_indices = []

        frame_idx = 0
        processed = 0

        logger.info(
            f"Extracting CLIP embeddings (sampling every {self.frame_sample_rate} frame(s))..."
        )

        try:
            while True:
                ret, frame = cap.read()
                if not ret:
                    break

                # 采样处理
                if frame_idx % self.frame_sample_rate == 0:
                    embedding = self.extract_frame_embedding(frame)
                    embeddings.append(embedding)
                    frame_indices.append(frame_idx)
                    processed += 1

                    if processed % 100 == 0:
                        progress = (frame_idx / frame_count) * 100
                        logger.info(f"Progress: {progress:.1f}% ({processed} frames processed)")

                frame_idx += 1

        finally:
            cap.release()

        logger.info(f"Extracted {len(embeddings)} embeddings from {frame_count} frames")
        return embeddings, frame_indices, fps

    def calculate_distance_curve(self, embeddings: list[np.ndarray]) -> np.ndarray:
        """
        计算距离曲线

        Args:
            embeddings: 所有帧的嵌入向量

        Returns:
            相邻帧之间的余弦距离数组
        """
        distances = []

        for i in range(len(embeddings) - 1):
            distance = self.calculate_cosine_distance(embeddings[i], embeddings[i + 1])
            distances.append(distance)

        return np.array(distances)

    def detect_peaks_in_curve(
        self, distances: np.ndarray, frame_indices: list[int], fps: float
    ) -> list[int]:
        """
        在距离曲线中检测峰值（场景切换点）

        Args:
            distances: 距离曲线
            frame_indices: 对应的帧索引
            fps: 视频帧率

        Returns:
            关键帧的索引列表
        """
        # 计算最小间隔（帧数）
        min_distance_frames = int(self.min_interval * fps / self.frame_sample_rate)

        # 使用 scipy 的峰值检测
        peaks, properties = find_peaks(
            distances,
            height=self.distance_threshold,  # 最小峰值高度
            prominence=self.peak_prominence,  # 峰值显著性
            distance=min_distance_frames,  # 最小间隔
        )

        logger.info(
            f"Detected {len(peaks)} peaks in distance curve "
            f"(threshold={self.distance_threshold}, prominence={self.peak_prominence})"
        )

        # 转换为原始帧索引
        # peaks 是在采样后的索引，需要映射回原始帧
        keyframe_indices = [frame_indices[peak] for peak in peaks]

        # 添加第一帧
        if 0 not in keyframe_indices:
            keyframe_indices.insert(0, 0)

        return keyframe_indices

    def detect_keyframes(
        self,
        video_path: str,
        output_dir: str | None = None,
        max_keyframes: int | None = None,
        save_images: bool = True,
        save_curve: bool = False,
    ) -> list[Keyframe]:
        """
        检测视频中的关键帧

        Args:
            video_path: 视频文件路径
            output_dir: 关键帧保存目录
            max_keyframes: 最大关键帧数量
            save_images: 是否保存关键帧图像
            save_curve: 是否保存距离曲线图（用于调试）

        Returns:
            关键帧列表
        """
        video_path_obj = Path(video_path)
        if output_dir is None:
            output_dir = str(video_path_obj.parent / f"{video_path_obj.stem}_keyframes_clip")

        if save_images:
            output_dir_obj = Path(output_dir)
            output_dir_obj.mkdir(parents=True, exist_ok=True)

        # 1. 提取所有帧的嵌入
        embeddings, frame_indices, fps = self.extract_all_embeddings(video_path)

        # 2. 计算距离曲线
        logger.info("Calculating distance curve...")
        distances = self.calculate_distance_curve(embeddings)

        # 3. 检测峰值
        logger.info("Detecting scene transitions...")
        keyframe_indices = self.detect_peaks_in_curve(distances, frame_indices, fps)

        # 限制数量
        if max_keyframes and len(keyframe_indices) > max_keyframes:
            # 根据距离排序，保留最显著的场景切换
            # 对于每个关键帧，获取其对应的距离值
            keyframe_distances = []
            for idx in keyframe_indices[1:]:  # 跳过第一帧（距离为 0）
                # 找到这个帧在 frame_indices 中的位置
                pos = frame_indices.index(idx)
                if pos > 0:
                    keyframe_distances.append((idx, distances[pos - 1]))

            # 按距离排序，保留最大的
            keyframe_distances.sort(key=lambda x: x[1], reverse=True)
            top_keyframes = [0] + [idx for idx, _ in keyframe_distances[: max_keyframes - 1]]
            keyframe_indices = sorted(top_keyframes)

            logger.info(f"Limited to {max_keyframes} most significant keyframes")

        # 4. 保存距离曲线（可选）
        if save_curve:
            self._save_distance_curve(distances, keyframe_indices, frame_indices, output_dir)

        # 5. 提取关键帧图像
        logger.info("Extracting keyframe images...")
        keyframes = self._extract_keyframe_images(
            video_path, keyframe_indices, fps, output_dir if save_images else None
        )

        logger.info(f"Detected {len(keyframes)} keyframes using CLIP")
        return keyframes

    def _extract_keyframe_images(
        self, video_path: str, keyframe_indices: list[int], fps: float, output_dir: str | None
    ) -> list[Keyframe]:
        """提取关键帧图像"""
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise RuntimeError(f"Failed to open video: {video_path}")

        keyframes = []

        try:
            for frame_idx in keyframe_indices:
                # 跳转到指定帧
                cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
                ret, frame = cap.read()

                if not ret:
                    logger.warning(f"Failed to read frame {frame_idx}")
                    continue

                timestamp = frame_idx / fps

                # 保存图像
                image_path = ""
                if output_dir:
                    output_dir_obj = Path(output_dir)
                    filename = f"keyframe_{frame_idx:06d}_{timestamp:.2f}s.jpg"
                    image_path = str(output_dir_obj / filename)
                    cv2.imwrite(image_path, frame, [cv2.IMWRITE_JPEG_QUALITY, 90])

                keyframe = Keyframe(
                    timestamp=timestamp, frame_number=frame_idx, image_path=image_path, score=1.0
                )
                keyframes.append(keyframe)

        finally:
            cap.release()

        return keyframes

    def _save_distance_curve(
        self,
        distances: np.ndarray,
        keyframe_indices: list[int],
        frame_indices: list[int],
        output_dir: str,
    ):
        """保存距离曲线图（用于调试和可视化）"""
        try:
            import matplotlib.pyplot as plt

            output_path = Path(output_dir) / "distance_curve.png"

            plt.figure(figsize=(15, 5))
            plt.plot(distances, label="Cosine Distance", linewidth=1)
            plt.axhline(
                y=self.distance_threshold, color="r", linestyle="--", label="Threshold", alpha=0.5
            )

            # 标记关键帧位置
            for kf_idx in keyframe_indices:
                if kf_idx in frame_indices:
                    pos = frame_indices.index(kf_idx)
                    if pos > 0 and pos < len(distances):
                        plt.axvline(x=pos, color="g", linestyle=":", alpha=0.3)

            plt.xlabel("Frame Index (sampled)")
            plt.ylabel("Cosine Distance")
            plt.title(
                f"CLIP Embedding Distance Curve (threshold={self.distance_threshold}, "
                f"prominence={self.peak_prominence})"
            )
            plt.legend()
            plt.grid(alpha=0.3)
            plt.tight_layout()
            plt.savefig(output_path, dpi=150)
            plt.close()

            logger.info(f"Distance curve saved to {output_path}")

        except ImportError:
            logger.warning("matplotlib not installed, skipping curve visualization")

    async def detect_keyframes_async(
        self,
        video_path: str,
        output_dir: str | None = None,
        max_keyframes: int | None = None,
        save_images: bool = True,
        save_curve: bool = False,
    ) -> list[Keyframe]:
        """异步检测关键帧"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            self.detect_keyframes,
            video_path,
            output_dir,
            max_keyframes,
            save_images,
            save_curve,
        )


# 便捷函数
def detect_with_clip_fast(video_path: str, **kwargs) -> list[Keyframe]:
    """
    快速 CLIP 检测（基础模型 + 高采样率）

    适合长视频或快速预览
    """
    detector = CLIPKeyframeDetector(
        model_name="openai/clip-vit-base-patch32",
        distance_threshold=0.3,
        frame_sample_rate=5,  # 每 5 帧采样一次
    )
    return detector.detect_keyframes(video_path, **kwargs)


def detect_with_clip_accurate(video_path: str, **kwargs) -> list[Keyframe]:
    """
    精确 CLIP 检测（大模型 + 低采样率）

    适合短视频或需要高精度的场景
    """
    detector = CLIPKeyframeDetector(
        model_name="openai/clip-vit-large-patch14",
        distance_threshold=0.25,
        peak_prominence=0.15,
        frame_sample_rate=2,  # 每 2 帧采样一次
    )
    return detector.detect_keyframes(video_path, **kwargs)


def detect_with_clip_balanced(video_path: str, **kwargs) -> list[Keyframe]:
    """
    平衡 CLIP 检测（推荐）

    速度和准确度的良好平衡
    """
    detector = CLIPKeyframeDetector(
        model_name="openai/clip-vit-base-patch32",
        distance_threshold=0.3,
        peak_prominence=0.1,
        frame_sample_rate=3,  # 每 3 帧采样一次
    )
    return detector.detect_keyframes(video_path, save_curve=True, **kwargs)
