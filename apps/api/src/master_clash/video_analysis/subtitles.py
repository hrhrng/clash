"""
字幕提取模块

从视频文件中提取嵌入的字幕轨道
"""

import asyncio
import json
import logging
from pathlib import Path

from .models import SubtitleTrack, TranscriptionSegment

logger = logging.getLogger(__name__)


class SubtitleExtractor:
    """字幕提取器"""

    async def get_subtitle_streams(self, video_path: str) -> list[dict]:
        """
        获取视频中的字幕流信息

        Args:
            video_path: 视频文件路径

        Returns:
            字幕流信息列表
        """
        cmd = [
            "ffprobe",
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_streams",
            "-select_streams",
            "s",  # 选择字幕流
            video_path,
        ]

        try:
            process = await asyncio.create_subprocess_exec(
                *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
            )

            stdout, stderr = await process.communicate()

            if process.returncode != 0:
                logger.warning(f"FFprobe failed: {stderr.decode()}")
                return []

            data = json.loads(stdout.decode())
            streams = data.get("streams", [])

            logger.info(f"Found {len(streams)} subtitle streams")
            return streams

        except FileNotFoundError:
            raise RuntimeError("FFprobe not found. Please install FFmpeg.") from None
        except Exception as e:
            logger.error(f"Failed to get subtitle streams: {e}")
            return []

    async def extract_subtitle_stream(
        self, video_path: str, stream_index: int, output_path: str, format: str = "srt"
    ) -> str:
        """
        提取指定字幕流

        Args:
            video_path: 视频文件路径
            stream_index: 字幕流索引
            output_path: 输出文件路径
            format: 输出格式 (srt, vtt, ass)

        Returns:
            输出文件路径
        """
        cmd = [
            "ffmpeg",
            "-i",
            video_path,
            "-map",
            f"0:s:{stream_index}",  # 选择字幕流
            "-c:s",
            format,  # 输出格式
            "-y",  # 覆盖
            output_path,
        ]

        try:
            process = await asyncio.create_subprocess_exec(
                *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
            )

            stdout, stderr = await process.communicate()

            if process.returncode != 0:
                error_msg = stderr.decode() if stderr else "Unknown error"
                raise RuntimeError(f"FFmpeg subtitle extraction failed: {error_msg}")

            logger.info(f"Subtitle extracted to {output_path}")
            return output_path

        except Exception as e:
            logger.error(f"Failed to extract subtitle: {e}")
            raise

    def parse_srt(self, srt_path: str) -> list[TranscriptionSegment]:
        """
        解析 SRT 字幕文件

        Args:
            srt_path: SRT 文件路径

        Returns:
            字幕片段列表
        """
        segments = []

        try:
            with open(srt_path, encoding="utf-8") as f:
                content = f.read()

            # 分割字幕块
            blocks = content.strip().split("\n\n")

            for block in blocks:
                lines = block.strip().split("\n")
                if len(lines) < 3:
                    continue

                # 解析时间戳
                timestamp_line = lines[1]
                if " --> " not in timestamp_line:
                    continue

                start_str, end_str = timestamp_line.split(" --> ")

                # 解析文本
                text = "\n".join(lines[2:])

                # 转换时间戳为秒
                start_time = self._parse_srt_timestamp(start_str)
                end_time = self._parse_srt_timestamp(end_str)

                segments.append(
                    TranscriptionSegment(text=text, start_time=start_time, end_time=end_time)
                )

            logger.info(f"Parsed {len(segments)} segments from SRT")
            return segments

        except Exception as e:
            logger.error(f"Failed to parse SRT: {e}")
            return []

    def _parse_srt_timestamp(self, timestamp: str) -> float:
        """
        解析 SRT 时间戳格式 (HH:MM:SS,mmm) 为秒

        Args:
            timestamp: 时间戳字符串

        Returns:
            秒数
        """
        # 格式: 00:00:01,500
        time_part, millis_part = timestamp.split(",")
        h, m, s = map(int, time_part.split(":"))
        millis = int(millis_part)

        total_seconds = h * 3600 + m * 60 + s + millis / 1000.0
        return total_seconds

    def parse_vtt(self, vtt_path: str) -> list[TranscriptionSegment]:
        """
        解析 VTT 字幕文件

        Args:
            vtt_path: VTT 文件路径

        Returns:
            字幕片段列表
        """
        segments = []

        try:
            with open(vtt_path, encoding="utf-8") as f:
                lines = f.readlines()

            # 跳过 WEBVTT 头
            i = 0
            while i < len(lines):
                line = lines[i].strip()
                if line.startswith("WEBVTT"):
                    i += 1
                    continue
                if not line:
                    i += 1
                    continue

                # 检查是否是时间戳行
                if " --> " in line:
                    timestamp_line = line
                    start_str, end_str = timestamp_line.split(" --> ")

                    # 读取字幕文本
                    text_lines = []
                    i += 1
                    while i < len(lines) and lines[i].strip():
                        text_lines.append(lines[i].strip())
                        i += 1

                    text = "\n".join(text_lines)

                    # 转换时间戳
                    start_time = self._parse_vtt_timestamp(start_str)
                    end_time = self._parse_vtt_timestamp(end_str.split()[0])  # 移除可选参数

                    segments.append(
                        TranscriptionSegment(text=text, start_time=start_time, end_time=end_time)
                    )

                i += 1

            logger.info(f"Parsed {len(segments)} segments from VTT")
            return segments

        except Exception as e:
            logger.error(f"Failed to parse VTT: {e}")
            return []

    def _parse_vtt_timestamp(self, timestamp: str) -> float:
        """
        解析 VTT 时间戳格式 (HH:MM:SS.mmm) 为秒

        Args:
            timestamp: 时间戳字符串

        Returns:
            秒数
        """
        # 格式: 00:00:01.500 或 00:01.500
        parts = timestamp.split(":")
        if len(parts) == 3:
            h, m, s = parts
            h = int(h)
        else:
            h = 0
            m, s = parts

        m = int(m)
        s_parts = s.split(".")
        s = int(s_parts[0])
        millis = int(s_parts[1]) if len(s_parts) > 1 else 0

        total_seconds = h * 3600 + m * 60 + s + millis / 1000.0
        return total_seconds

    async def extract_all_subtitles(
        self, video_path: str, output_dir: str | None = None, format: str = "srt"
    ) -> list[SubtitleTrack]:
        """
        提取视频中的所有字幕轨道

        Args:
            video_path: 视频文件路径
            output_dir: 输出目录，默认与视频同目录
            format: 输出格式

        Returns:
            字幕轨道列表
        """
        # 获取字幕流信息
        streams = await self.get_subtitle_streams(video_path)
        if not streams:
            logger.info("No subtitle streams found in video")
            return []

        # 准备输出目录
        video_path_obj = Path(video_path)
        if output_dir is None:
            output_dir = str(video_path_obj.parent)

        output_dir_obj = Path(output_dir)
        output_dir_obj.mkdir(parents=True, exist_ok=True)

        # 提取所有字幕
        subtitle_tracks = []
        for i, stream in enumerate(streams):
            language = stream.get("tags", {}).get("language", f"track_{i}")
            output_file = output_dir_obj / f"{video_path_obj.stem}_{language}.{format}"

            try:
                # 提取字幕
                await self.extract_subtitle_stream(video_path, i, str(output_file), format)

                # 解析字幕
                if format == "srt":
                    segments = self.parse_srt(str(output_file))
                elif format == "vtt":
                    segments = self.parse_vtt(str(output_file))
                else:
                    logger.warning(f"Unsupported format for parsing: {format}")
                    segments = []

                subtitle_tracks.append(
                    SubtitleTrack(language=language, segments=segments, format=format)
                )

            except Exception as e:
                logger.error(f"Failed to extract subtitle track {i}: {e}")

        return subtitle_tracks
