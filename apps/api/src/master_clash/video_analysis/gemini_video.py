"""
Gemini 视频理解模块

使用 Google Gemini 2.5 Pro 进行深度视频分析
"""

import base64
import logging
from pathlib import Path
from typing import Any

from langchain_core.messages import HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI

from master_clash.config import get_settings

from .models import GeminiVideoInsight, Keyframe

logger = logging.getLogger(__name__)


class GeminiVideoAnalyzer:
    """Gemini 视频分析器"""

    def __init__(self, model: str = "gemini-2.5-pro"):
        """
        初始化 Gemini 视频分析器

        Args:
            model: Gemini 模型名称
        """
        self.model = model
        settings = get_settings()

        self.llm = ChatGoogleGenerativeAI(
            model=model,
            base_url=settings.google_ai_studio_base_url,
            transport="rest",
        )

        logger.info(f"Initialized GeminiVideoAnalyzer with model: {model}")

    def _encode_video_to_base64(self, video_path: str) -> str:
        """
        将视频文件编码为 base64

        Args:
            video_path: 视频文件路径

        Returns:
            Base64 编码的视频数据
        """
        with open(video_path, "rb") as video_file:
            video_data = video_file.read()
            base64_data = base64.b64encode(video_data).decode("utf-8")
            return base64_data

    def _get_mime_type(self, video_path: str) -> str:
        """
        根据文件扩展名获取 MIME 类型

        Args:
            video_path: 视频文件路径

        Returns:
            MIME 类型字符串
        """
        suffix = Path(video_path).suffix.lower()
        mime_types = {
            ".mp4": "video/mp4",
            ".mov": "video/quicktime",
            ".avi": "video/x-msvideo",
            ".mkv": "video/x-matroska",
            ".webm": "video/webm",
            ".flv": "video/x-flv",
            ".wmv": "video/x-ms-wmv",
            ".m4v": "video/x-m4v",
        }
        return mime_types.get(suffix, "video/mp4")

    async def analyze_video(
        self, video_path: str, custom_prompt: str | None = None
    ) -> GeminiVideoInsight:
        """
        分析视频内容

        Args:
            video_path: 视频文件路径
            custom_prompt: 自定义分析提示词

        Returns:
            视频分析结果
        """
        logger.info(f"Analyzing video with Gemini: {video_path}")

        # 编码视频
        base64_data = self._encode_video_to_base64(video_path)
        mime_type = self._get_mime_type(video_path)

        # 构建提示词
        if custom_prompt is None:
            custom_prompt = """请对这个视频进行全面深入的分析，提供以下内容：

1. **视频概要**：用 2-3 句话概括视频的主要内容和主题。

2. **关键时刻**：识别视频中的重要时刻，每个时刻包括：
   - 时间戳（大致时间）
   - 描述（发生了什么）
   - 重要性（为什么这个时刻重要）

3. **物体检测**：列出视频中出现的主要物体、人物、地点。

4. **场景分析**：描述视频中的不同场景，包括：
   - 场景描述
   - 视觉风格
   - 氛围/情绪

5. **活动识别**：列出视频中发生的主要活动和动作。

6. **情感分析**：识别视频中传达的情感和情绪（如果适用）。

7. **文字内容**：如果视频中有文字（标题、字幕、标识等），请提取出来。

8. **音频事件**：描述重要的音频元素（对话、音乐、音效等）。

请以 JSON 格式返回结果，包含以下字段：
{
  "summary": "视频概要",
  "key_moments": [
    {
      "timestamp": "时间描述",
      "description": "时刻描述",
      "importance": "重要性说明"
    }
  ],
  "objects_detected": ["物体1", "物体2", ...],
  "scenes": [
    {
      "description": "场景描述",
      "visual_style": "视觉风格",
      "mood": "氛围"
    }
  ],
  "activities": ["活动1", "活动2", ...],
  "emotions": ["情感1", "情感2", ...],
  "text_in_video": ["文字1", "文字2", ...],
  "audio_events": ["音频事件1", "音频事件2", ...]
}"""

        # 构建消息
        content_block = [
            {"type": "text", "text": custom_prompt},
            {"type": "media", "data": base64_data, "mime_type": mime_type},
        ]

        message = HumanMessage(content=content_block)

        # 调用 Gemini
        try:
            response = await self.llm.ainvoke([message])
            result_text = response.content

            # 解析响应
            insight = self._parse_response(result_text)
            logger.info("Video analysis completed")
            return insight

        except Exception as e:
            logger.error(f"Failed to analyze video: {e}")
            raise

    def _parse_response(self, response_text: str) -> GeminiVideoInsight:
        """
        解析 Gemini 响应

        Args:
            response_text: Gemini 返回的文本

        Returns:
            结构化的视频洞察
        """
        import json
        import re

        # 尝试提取 JSON
        try:
            # 查找 JSON 代码块
            json_match = re.search(r"```json\s*(\{.*?\})\s*```", response_text, re.DOTALL)
            json_str = json_match.group(1) if json_match else response_text

            data = json.loads(json_str)

            # 构建 GeminiVideoInsight
            return GeminiVideoInsight(
                summary=data.get("summary", ""),
                key_moments=data.get("key_moments", []),
                objects_detected=data.get("objects_detected", []),
                scenes=data.get("scenes", []),
                activities=data.get("activities", []),
                emotions=data.get("emotions"),
                text_in_video=data.get("text_in_video"),
                audio_events=data.get("audio_events"),
                metadata={"raw_response": response_text},
            )

        except json.JSONDecodeError:
            # 如果无法解析 JSON，返回原始文本
            logger.warning("Failed to parse JSON response, using raw text")
            return GeminiVideoInsight(
                summary=response_text,
                key_moments=[],
                objects_detected=[],
                scenes=[],
                activities=[],
                metadata={"raw_response": response_text, "parse_error": True},
            )

    async def analyze_keyframes(
        self, keyframes: list[Keyframe], custom_prompt: str | None = None
    ) -> dict[str, Any]:
        """
        分析关键帧图像

        Args:
            keyframes: 关键帧列表
            custom_prompt: 自定义提示词

        Returns:
            关键帧分析结果
        """
        if not keyframes:
            return {"descriptions": [], "error": "No keyframes provided"}

        logger.info(f"Analyzing {len(keyframes)} keyframes")

        if custom_prompt is None:
            custom_prompt = "请描述这些图像，包括视觉内容、风格、情绪和任何重要细节。"

        descriptions = []

        for i, keyframe in enumerate(keyframes):
            if not keyframe.image_path or not Path(keyframe.image_path).exists():
                logger.warning(f"Keyframe {i} has no valid image path")
                descriptions.append(
                    {
                        "frame_number": keyframe.frame_number,
                        "timestamp": keyframe.timestamp,
                        "description": "Image not available",
                    }
                )
                continue

            try:
                # 读取图像并编码为 base64
                with open(keyframe.image_path, "rb") as img_file:
                    img_data = base64.b64encode(img_file.read()).decode("utf-8")

                # 构建消息
                content_block = [
                    {
                        "type": "text",
                        "text": f"{custom_prompt}\n\n时间戳: {keyframe.timestamp:.2f}秒",
                    },
                    {"type": "image_url", "image_url": f"data:image/jpeg;base64,{img_data}"},
                ]

                message = HumanMessage(content=content_block)
                response = await self.llm.ainvoke([message])

                descriptions.append(
                    {
                        "frame_number": keyframe.frame_number,
                        "timestamp": keyframe.timestamp,
                        "description": response.content,
                    }
                )

                # 更新 keyframe 对象
                keyframe.description = response.content

            except Exception as e:
                logger.error(f"Failed to analyze keyframe {i}: {e}")
                descriptions.append(
                    {
                        "frame_number": keyframe.frame_number,
                        "timestamp": keyframe.timestamp,
                        "description": f"Error: {str(e)}",
                    }
                )

        logger.info(f"Analyzed {len(descriptions)} keyframes")
        return {"descriptions": descriptions}

    async def compare_scenes(
        self, keyframes: list[Keyframe], prompt: str | None = None
    ) -> dict[str, Any]:
        """
        比较不同场景的关键帧

        Args:
            keyframes: 关键帧列表
            prompt: 自定义提示词

        Returns:
            场景比较结果
        """
        if len(keyframes) < 2:
            return {"error": "Need at least 2 keyframes for comparison"}

        if prompt is None:
            prompt = """请比较这些图像，分析：
1. 场景之间的变化
2. 视觉风格的演变
3. 情绪和氛围的转变
4. 关键差异和相似之处"""

        logger.info(f"Comparing {len(keyframes)} scenes")

        # 构建包含多个图像的消息
        content_block = [{"type": "text", "text": prompt}]

        for keyframe in keyframes[:10]:  # 限制最多 10 个关键帧
            if keyframe.image_path and Path(keyframe.image_path).exists():
                with open(keyframe.image_path, "rb") as img_file:
                    img_data = base64.b64encode(img_file.read()).decode("utf-8")
                    content_block.append(
                        {"type": "image_url", "image_url": f"data:image/jpeg;base64,{img_data}"}
                    )

        try:
            message = HumanMessage(content=content_block)
            response = await self.llm.ainvoke([message])

            return {"comparison": response.content, "num_frames_compared": len(keyframes)}

        except Exception as e:
            logger.error(f"Failed to compare scenes: {e}")
            return {"error": str(e)}
