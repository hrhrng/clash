"""
Service Protocols - 定义服务接口的抽象协议

使用 Protocol 来定义服务接口，允许不同的实现可以互换使用
"""

from typing import Protocol, runtime_checkable
from pathlib import Path


@runtime_checkable
class StorageProvider(Protocol):
    """云存储提供商协议"""

    async def upload_file(
        self, file_path: str, blob_name: str, mime_type: str = "application/octet-stream"
    ) -> str:
        """
        上传文件到云存储

        Args:
            file_path: 本地文件路径
            blob_name: 远程文件名/路径
            mime_type: 文件 MIME 类型

        Returns:
            云存储 URI (如 gs://bucket/path)
        """
        ...

    async def upload_bytes(
        self, data: bytes, blob_name: str, mime_type: str = "application/octet-stream"
    ) -> str:
        """
        上传字节数据到云存储

        Args:
            data: 字节数据
            blob_name: 远程文件名/路径
            mime_type: 文件 MIME 类型

        Returns:
            云存储 URI
        """
        ...

    async def delete_file(self, uri: str) -> None:
        """
        删除云存储中的文件

        Args:
            uri: 云存储 URI
        """
        ...

    async def get_public_url(self, uri: str) -> str:
        """
        获取文件的公共访问 URL

        Args:
            uri: 云存储 URI

        Returns:
            公共 HTTP(S) URL
        """
        ...


@runtime_checkable
class TranscriptionSegment(Protocol):
    """转录片段协议"""

    text: str  # 转录文本
    start_time: float  # 开始时间（秒）
    end_time: float  # 结束时间（秒）
    confidence: float | None  # 置信度（0-1）
    language: str | None  # 语言代码


@runtime_checkable
class ASRProvider(Protocol):
    """ASR (语音识别) 提供商协议"""

    async def transcribe_audio(
        self, audio_path: str, language: str | None = None
    ) -> list[TranscriptionSegment]:
        """
        转录音频文件

        Args:
            audio_path: 音频文件路径
            language: 语言代码（可选）

        Returns:
            转录片段列表，每个片段包含文本和时间戳
        """
        ...

    async def transcribe_video(
        self, video_path: str, language: str | None = None
    ) -> list[TranscriptionSegment]:
        """
        转录视频文件（自动提取音频）

        Args:
            video_path: 视频文件路径
            language: 语言代码（可选）

        Returns:
            转录片段列表
        """
        ...


@runtime_checkable
class ShotDetectionResult(Protocol):
    """镜头检测结果协议"""

    start_time: float  # 开始时间（秒）
    end_time: float  # 结束时间（秒）
    duration: float  # 持续时间（秒）


@runtime_checkable
class ShotDetectionProvider(Protocol):
    """镜头检测提供商协议"""

    async def detect_shots(self, video_uri: str) -> list[ShotDetectionResult]:
        """
        检测视频中的镜头切换

        Args:
            video_uri: 视频 URI（本地路径或云存储 URI）

        Returns:
            镜头列表
        """
        ...


# 具体的数据类实现（用于实际返回值）

from dataclasses import dataclass


@dataclass
class TranscriptionSegmentImpl:
    """转录片段的具体实现"""

    text: str
    start_time: float
    end_time: float
    confidence: float | None = None
    language: str | None = None

    @property
    def duration(self) -> float:
        """片段持续时间"""
        return self.end_time - self.start_time


@dataclass
class ShotDetectionResultImpl:
    """镜头检测结果的具体实现"""

    start_time: float
    end_time: float

    @property
    def duration(self) -> float:
        """镜头持续时间"""
        return self.end_time - self.start_time

    def to_dict(self) -> dict:
        """转换为字典"""
        return {
            "start_time": self.start_time,
            "end_time": self.end_time,
            "duration": self.duration,
        }
