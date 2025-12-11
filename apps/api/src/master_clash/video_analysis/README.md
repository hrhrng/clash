# 视频分析模块

全面的视频理解系统，整合了 ASR、字幕提取、关键帧检测和 Gemini AI 视频理解能力。

## 功能特性

### 🎤 ASR (语音识别)
- 使用 OpenAI Whisper API 进行高质量语音转文字
- 自动语言检测或指定语言
- 时间戳精确到片段级别
- 支持导出 SRT、VTT、JSON 格式

### 📝 字幕提取
- 从视频文件提取嵌入的字幕轨道
- 支持多语言字幕
- 解析 SRT 和 VTT 格式
- 自动转换为统一数据结构

### 🖼️ 关键帧检测
- 基于场景变化的智能关键帧检测
- 可配置的检测阈值和间隔
- 支持均匀采样模式
- 自动保存关键帧图像

### 🤖 Gemini 视频理解
- 使用 Google Gemini 2.5 Pro 进行深度视频分析
- 生成视频摘要和关键时刻
- 物体检测和场景分析
- 活动识别和情感分析
- 文字内容提取和音频事件识别
- 支持关键帧批量分析和场景对比

## 安装

确保已安装所需依赖：

```bash
# 在 backend 目录下
uv sync
```

必需的系统依赖：
- **FFmpeg**: 用于音频提取和字幕处理
  ```bash
  # macOS
  brew install ffmpeg

  # Ubuntu/Debian
  apt-get install ffmpeg

  # Windows
  # 从 https://ffmpeg.org/download.html 下载
  ```

## 快速开始

### 1. 使用编排器进行完整分析

```python
import asyncio
from master_clash.video_analysis import VideoAnalysisOrchestrator, VideoAnalysisConfig

async def analyze_video():
    # 配置分析选项
    config = VideoAnalysisConfig(
        enable_asr=True,
        enable_subtitle_extraction=True,
        enable_keyframe_detection=True,
        enable_gemini_analysis=True,
        asr_language="auto",  # 或 "zh", "en" 等
        keyframe_threshold=0.3,
        max_keyframes=50,
        gemini_model="gemini-2.5-pro",
    )

    # 创建编排器
    orchestrator = VideoAnalysisOrchestrator(config)

    # 运行分析
    result = await orchestrator.analyze_video(
        video_path="path/to/video.mp4",
        output_dir="path/to/output"
    )

    # 查看结果
    print(f"视频时长: {result.metadata.duration:.2f}秒")
    print(f"转录片段: {len(result.transcription)}")
    print(f"关键帧: {len(result.keyframes)}")
    print(f"摘要: {result.summary}")

    return result

# 运行
result = asyncio.run(analyze_video())
```

### 2. 使用单独的组件

#### ASR (语音识别)

```python
from master_clash.video_analysis import AudioTranscriber

async def transcribe():
    transcriber = AudioTranscriber()

    # 转录视频
    segments = await transcriber.transcribe_video(
        "video.mp4",
        language="zh"  # 可选
    )

    # 导出为 SRT
    transcriber.export_to_srt(segments, "output.srt")

    return segments
```

#### 关键帧检测

```python
from master_clash.video_analysis import KeyframeDetector

async def detect_keyframes():
    detector = KeyframeDetector(
        threshold=30.0,  # 场景变化阈值
        min_interval=1.0  # 最小间隔（秒）
    )

    # 检测关键帧
    keyframes = await detector.detect_keyframes_async(
        video_path="video.mp4",
        output_dir="keyframes",
        max_keyframes=50,
        save_images=True
    )

    return keyframes
```

#### Gemini 视频理解

```python
from master_clash.video_analysis import GeminiVideoAnalyzer

async def analyze_with_gemini():
    analyzer = GeminiVideoAnalyzer(model="gemini-2.5-pro")

    # 分析视频
    insights = await analyzer.analyze_video("video.mp4")

    print(f"摘要: {insights.summary}")
    print(f"物体: {insights.objects_detected}")
    print(f"场景: {insights.scenes}")

    return insights
```

### 3. 使用 API 端点

```bash
# 发起视频分析请求
curl -X POST "http://localhost:8000/api/analyze-video" \
  -H "Content-Type: application/json" \
  -d '{
    "video_path": "/path/to/video.mp4",
    "enable_asr": true,
    "enable_keyframe_detection": true,
    "enable_gemini_analysis": true,
    "gemini_model": "gemini-2.5-pro",
    "callback_url": "http://your-server.com/callback"
  }'

# 响应
{
  "task_id": "uuid-here",
  "status": "processing",
  "message": "Video analysis started in background"
}
```

## 配置选项

### VideoAnalysisConfig

```python
config = VideoAnalysisConfig(
    # 启用/禁用功能
    enable_asr=True,
    enable_subtitle_extraction=True,
    enable_keyframe_detection=True,
    enable_gemini_analysis=True,

    # ASR 配置
    asr_language="auto",  # "auto", "zh", "en", "ja" 等
    asr_model="whisper-1",

    # 字幕配置
    subtitle_languages=None,  # 或 ["zh", "en"]

    # 关键帧配置
    keyframe_interval=None,  # None 表示自动
    keyframe_threshold=0.3,  # 0-1，越小越敏感
    max_keyframes=50,

    # Gemini 配置
    gemini_model="gemini-2.5-pro",
    gemini_prompt=None,  # 自定义提示词

    # 输出配置
    save_keyframes=True,
    keyframes_output_dir=None,
    save_transcription=True,
    transcription_format="json",  # "json", "srt", "vtt"

    # 性能配置
    max_workers=4,
)
```

## 数据模型

### VideoAnalysisResult

```python
{
    "video_path": "path/to/video.mp4",
    "video_id": "20241205_143022",
    "metadata": {
        "duration": 120.5,
        "fps": 30.0,
        "width": 1920,
        "height": 1080,
        "codec": "h264",
        "size_bytes": 50000000,
        "has_audio": true
    },
    "transcription": [
        {
            "text": "这是转录的文本",
            "start_time": 0.0,
            "end_time": 5.0,
            "confidence": 0.95,
            "language": "zh"
        }
    ],
    "keyframes": [
        {
            "timestamp": 10.5,
            "frame_number": 315,
            "image_path": "keyframe_000315_10.50s.jpg",
            "description": "Gemini 生成的描述",
            "score": 85.2
        }
    ],
    "gemini_insights": {
        "summary": "视频摘要",
        "key_moments": [...],
        "objects_detected": ["person", "car", "building"],
        "scenes": [...],
        "activities": ["walking", "talking"],
        "emotions": ["happy", "excited"],
        "text_in_video": ["标题文字"],
        "audio_events": ["music", "speech"]
    },
    "summary": "综合摘要",
    "tags": ["标签1", "标签2"],
    "processing_time_seconds": 45.2,
    "errors": []
}
```

## 测试

运行测试脚本：

```bash
# 完整分析
python test_video_analysis.py video.mp4

# 仅 ASR
python test_video_analysis.py video.mp4 asr

# 仅关键帧检测
python test_video_analysis.py video.mp4 keyframe

# 仅 Gemini 分析
python test_video_analysis.py video.mp4 gemini
```

## 性能优化建议

1. **并行处理**: ASR、字幕提取和关键帧检测会并行执行
2. **关键帧限制**: 设置合理的 `max_keyframes` 避免过多
3. **分块处理**: 对于超长视频，可以使用 `chunk_duration` 配置
4. **模型选择**: 根据需求选择合适的 Gemini 模型
   - `gemini-2.5-flash`: 更快，成本更低
   - `gemini-2.5-pro`: 更准确，更深入

## 依赖说明

- **OpenAI API**: 用于 Whisper ASR
- **Google Gemini API**: 用于视频理解
- **OpenCV**: 用于视频处理和关键帧检测
- **FFmpeg**: 用于音频提取和字幕处理

## 故障排除

### FFmpeg 未找到

```bash
# 检查 FFmpeg 是否安装
ffmpeg -version

# 如未安装，请按照安装部分的说明进行安装
```

### OpenAI API 密钥错误

确保在 `.env` 文件中设置了 `OPENAI_API_KEY`：

```bash
OPENAI_API_KEY=sk-xxx
```

### Gemini API 错误

确保在 `.env` 文件中设置了 `GOOGLE_API_KEY`：

```bash
GOOGLE_API_KEY=xxx
```

### 内存不足

- 减少 `max_keyframes`
- 降低视频分辨率
- 使用 `chunk_duration` 分块处理

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！
