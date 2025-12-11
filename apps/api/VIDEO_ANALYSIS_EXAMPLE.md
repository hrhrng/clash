# 视频分析模块使用示例

## 模块概述

视频分析模块位于 `backend/src/master_clash/video_analysis/`，提供了全面的视频理解能力。

## 模块结构

```
video_analysis/
├── __init__.py              # 模块导出
├── models.py                # 数据模型定义
├── asr.py                   # ASR 语音识别
├── subtitles.py             # 字幕提取
├── keyframes.py             # 关键帧检测
├── gemini_video.py          # Gemini 视频理解
├── orchestrator.py          # 编排器（整合所有功能）
└── README.md                # 详细文档
```

## 核心功能

### 1. 语音识别 (ASR)
- **技术**: OpenAI Whisper API
- **特性**:
  - 自动语言检测
  - 时间戳精确到片段
  - 导出 SRT/VTT/JSON

### 2. 字幕提取
- **技术**: FFmpeg
- **特性**:
  - 提取嵌入字幕
  - 多语言支持
  - 统一数据格式

### 3. 关键帧检测
- **技术**: OpenCV + 场景变化算法
- **特性**:
  - 智能场景变化检测
  - 可配置阈值
  - 均匀采样模式

### 4. Gemini 视频理解
- **技术**: Google Gemini 2.5 Pro
- **特性**:
  - 视频摘要生成
  - 物体和场景识别
  - 活动和情感分析
  - 文字和音频事件提取

## 快速使用

### 方式一：Python 直接调用

```python
import asyncio
from master_clash.video_analysis import VideoAnalysisOrchestrator, VideoAnalysisConfig

async def main():
    config = VideoAnalysisConfig(
        enable_asr=True,
        enable_keyframe_detection=True,
        enable_gemini_analysis=True,
        gemini_model="gemini-2.5-pro"
    )

    orchestrator = VideoAnalysisOrchestrator(config)
    result = await orchestrator.analyze_video("video.mp4", "output")

    print(result.summary)

asyncio.run(main())
```

### 方式二：使用测试脚本

```bash
cd backend
python test_video_analysis.py path/to/video.mp4
```

### 方式三：通过 API 调用

```bash
curl -X POST "http://localhost:8000/api/analyze-video" \
  -H "Content-Type: application/json" \
  -d '{
    "video_path": "/path/to/video.mp4",
    "enable_gemini_analysis": true,
    "gemini_model": "gemini-2.5-pro"
  }'
```

## API 端点

### POST /api/analyze-video

**请求参数:**

```json
{
  "video_path": "/path/to/video.mp4",
  "output_dir": "/path/to/output",
  "enable_asr": true,
  "enable_subtitle_extraction": true,
  "enable_keyframe_detection": true,
  "enable_gemini_analysis": true,
  "asr_language": "auto",
  "keyframe_threshold": 0.3,
  "max_keyframes": 50,
  "gemini_model": "gemini-2.5-pro",
  "gemini_prompt": "自定义提示词（可选）",
  "callback_url": "http://your-server.com/callback"
}
```

**响应:**

```json
{
  "task_id": "uuid",
  "status": "processing",
  "message": "Video analysis started in background"
}
```

**回调数据（完成时）:**

```json
{
  "taskId": "uuid",
  "status": "completed",
  "result": {
    "video_path": "...",
    "metadata": {...},
    "transcription": [...],
    "keyframes": [...],
    "gemini_insights": {...},
    "summary": "...",
    "tags": [...]
  }
}
```

## 输出结果

分析完成后会生成：

```
output_dir/
├── analysis_result.json      # 完整分析结果
├── transcription.srt         # SRT 字幕文件
├── transcription.json        # JSON 格式转录
└── keyframes/                # 关键帧图像
    ├── keyframe_000000_0.00s.jpg
    ├── keyframe_000315_10.50s.jpg
    └── ...
```

## 环境配置

在 `.env` 文件中设置必要的 API 密钥：

```bash
# OpenAI API (用于 Whisper ASR)
OPENAI_API_KEY=sk-xxx

# Google API (用于 Gemini 视频理解)
GOOGLE_API_KEY=xxx

# Cloudflare Gateway (可选，加速访问)
GOOGLE_AI_STUDIO_BASE_URL=https://gateway.ai.cloudflare.com/v1/...
```

## 依赖安装

```bash
cd backend
uv sync

# 安装 FFmpeg（系统依赖）
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt-get install ffmpeg
```

## 性能建议

1. **视频大小**: 建议 < 500MB，大文件会增加处理时间
2. **关键帧数量**: 默认 50 个，可根据视频长度调整
3. **模型选择**:
   - `gemini-2.5-flash`: 快速、便宜（适合预览）
   - `gemini-2.5-pro`: 深度分析（适合生产）

## 完整示例代码

```python
"""完整的视频分析示例"""
import asyncio
from pathlib import Path
from master_clash.video_analysis import (
    VideoAnalysisOrchestrator,
    VideoAnalysisConfig,
)

async def analyze_my_video():
    # 配置
    config = VideoAnalysisConfig(
        enable_asr=True,
        enable_subtitle_extraction=False,  # 如果没有嵌入字幕可关闭
        enable_keyframe_detection=True,
        enable_gemini_analysis=True,

        asr_language="zh",  # 中文
        keyframe_threshold=0.3,
        max_keyframes=30,
        gemini_model="gemini-2.5-pro",

        save_keyframes=True,
        save_transcription=True,
        transcription_format="srt",
    )

    # 创建编排器
    orchestrator = VideoAnalysisOrchestrator(config)

    # 运行分析
    video_path = "my_video.mp4"
    output_dir = "analysis_output"

    print(f"开始分析视频: {video_path}")
    result = await orchestrator.analyze_video(video_path, output_dir)

    # 输出结果
    print("\n=== 分析结果 ===")
    print(f"视频时长: {result.metadata.duration:.2f}秒")
    print(f"分辨率: {result.metadata.width}x{result.metadata.height}")

    if result.transcription:
        print(f"\n转录片段数: {len(result.transcription)}")
        print(f"示例: {result.transcription[0].text}")

    if result.keyframes:
        print(f"\n关键帧数: {len(result.keyframes)}")
        print(f"保存位置: {Path(output_dir) / 'keyframes'}")

    if result.gemini_insights:
        print(f"\n视频摘要:\n{result.gemini_insights.summary}")
        print(f"\n检测到的物体: {', '.join(result.gemini_insights.objects_detected[:10])}")

    print(f"\n处理时间: {result.processing_time_seconds:.2f}秒")
    print(f"完整结果: {Path(output_dir) / 'analysis_result.json'}")

    return result

if __name__ == "__main__":
    result = asyncio.run(analyze_my_video())
```

## 下一步

- 查看 [README.md](src/master_clash/video_analysis/README.md) 了解更多详细信息
- 运行 `test_video_analysis.py` 进行测试
- 集成到你的应用中

## 技术支持

如有问题，请查看：
1. 模块 README: `backend/src/master_clash/video_analysis/README.md`
2. 测试脚本: `backend/test_video_analysis.py`
3. API 代码: `backend/src/master_clash/api/main.py`
