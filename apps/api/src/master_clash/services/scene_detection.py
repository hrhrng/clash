"""
Scene Detection Service - 基于帧 embedding 聚类的场景变化检测

用于检测"一镜到底"等无镜头切换视频中的场景变化

流程:
1. FFmpeg 抽帧 (每 N 秒一帧)
2. Vertex AI multimodal embedding 获取每帧向量
3. 计算相邻帧 cosine distance
4. 检测变化点 (distance > threshold)
"""

import asyncio
import logging
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from dataclasses import dataclass

import numpy as np
from vertexai.vision_models import MultiModalEmbeddingModel, Image

logger = logging.getLogger(__name__)


@dataclass
class SceneChange:
    """场景变化点"""
    timestamp: float  # 时间戳（秒）
    distance: float   # 与前一帧的距离
    confidence: float # 置信度 (0-1)


class SceneDetectionService:
    """
    场景检测服务 - 基于帧 embedding 聚类
    
    Example:
        ```python
        service = SceneDetectionService()
        
        # 检测场景变化
        changes = await service.detect_scene_changes(
            "/path/to/video.mp4",
            frame_interval=2.0,  # 每2秒抽一帧
            threshold=0.3,       # 距离阈值
        )
        
        for change in changes:
            print(f"Scene change at {change.timestamp:.1f}s (distance: {change.distance:.3f})")
        ```
    """
    
    def __init__(self):
        """初始化服务"""
        self.embedding_model = MultiModalEmbeddingModel.from_pretrained("multimodalembedding@001")
        logger.info("Initialized SceneDetectionService")
    
    async def detect_scene_changes(
        self,
        video_path: str,
        frame_interval: float = 2.0,
        threshold: float = 0.3,
        dimension: int = 512,
        cleanup_frames: bool = True,
    ) -> list[SceneChange]:
        """
        检测视频中的场景变化
        
        Args:
            video_path: 视频文件路径
            frame_interval: 抽帧间隔（秒）
            threshold: 距离阈值，越大表示变化越明显
            dimension: embedding 维度 (128, 256, 512, 1408)
            cleanup_frames: 是否清理临时帧文件
            
        Returns:
            场景变化点列表
        """
        if not Path(video_path).exists():
            raise FileNotFoundError(f"Video not found: {video_path}")
        
        # 创建临时目录
        temp_dir = tempfile.mkdtemp(prefix="scene_detect_")
        
        try:
            # 1. FFmpeg 抽帧
            logger.info(f"[SceneDetection] Extracting frames every {frame_interval}s...")
            frame_paths = await self._extract_frames(video_path, temp_dir, frame_interval)
            logger.info(f"[SceneDetection] Extracted {len(frame_paths)} frames")
            
            if len(frame_paths) < 2:
                return []
            
            # 2. 获取 embeddings
            logger.info("[SceneDetection] Getting embeddings...")
            embeddings = await self._get_embeddings(frame_paths, dimension)
            
            # 3. 计算相邻帧距离
            logger.info("[SceneDetection] Computing distances...")
            distances = self._compute_distances(embeddings)
            
            # 4. 检测变化点
            scene_changes = []
            for i, distance in enumerate(distances):
                if distance > threshold:
                    timestamp = (i + 1) * frame_interval
                    confidence = min(1.0, distance / (threshold * 2))
                    scene_changes.append(SceneChange(
                        timestamp=timestamp,
                        distance=distance,
                        confidence=confidence,
                    ))
            
            logger.info(f"[SceneDetection] Detected {len(scene_changes)} scene changes")
            return scene_changes
            
        finally:
            if cleanup_frames and os.path.exists(temp_dir):
                shutil.rmtree(temp_dir)
    
    async def _extract_frames(
        self, video_path: str, output_dir: str, interval: float
    ) -> list[str]:
        """使用 FFmpeg 抽帧"""
        output_pattern = os.path.join(output_dir, "frame_%04d.jpg")
        
        cmd = [
            "ffmpeg", "-i", video_path,
            "-vf", f"fps=1/{interval}",
            "-q:v", "2",  # 高质量 JPEG
            output_pattern,
            "-hide_banner", "-loglevel", "error"
        ]
        
        process = await asyncio.to_thread(
            subprocess.run, cmd, capture_output=True, text=True
        )
        
        if process.returncode != 0:
            raise RuntimeError(f"FFmpeg failed: {process.stderr}")
        
        # 获取所有帧文件
        frame_paths = sorted(Path(output_dir).glob("frame_*.jpg"))
        return [str(p) for p in frame_paths]
    
    async def _get_embeddings(
        self, frame_paths: list[str], dimension: int
    ) -> list[np.ndarray]:
        """获取所有帧的 embedding"""
        embeddings = []
        
        for i, path in enumerate(frame_paths):
            if i % 10 == 0:
                logger.info(f"[SceneDetection] Processing frame {i+1}/{len(frame_paths)}")
            
            # 使用 Vertex AI multimodal embedding
            image = Image.load_from_file(path)
            embedding_response = await asyncio.to_thread(
                self.embedding_model.get_embeddings,
                image=image,
                dimension=dimension,
            )
            
            # 获取 image embedding
            embedding = np.array(embedding_response.image_embedding)
            embeddings.append(embedding)
        
        return embeddings
    
    def _compute_distances(self, embeddings: list[np.ndarray]) -> list[float]:
        """计算相邻帧的 cosine distance"""
        distances = []
        
        for i in range(1, len(embeddings)):
            prev = embeddings[i - 1]
            curr = embeddings[i]
            
            # Cosine distance = 1 - cosine_similarity
            similarity = np.dot(prev, curr) / (np.linalg.norm(prev) * np.linalg.norm(curr))
            distance = 1 - similarity
            distances.append(float(distance))
        
        return distances
    
    def get_optimal_threshold(self, video_path: str) -> float:
        """
        根据视频类型推荐阈值
        
        - 一镜到底航拍: 0.2-0.3
        - 普通视频: 0.3-0.5
        - 快速剪辑: 0.5-0.7
        """
        # 可以根据视频时长、帧率等动态调整
        return 0.3
