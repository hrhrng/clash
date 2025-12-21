# Video Intelligence & Gemini ASR 服务 API 参考

## 1. Video Intelligence Service - Shot Detection

### 导入
```python
from master_clash.services import VideoIntelligenceService
```

### 初始化
```python
service = VideoIntelligenceService()
# 无需参数，自动使用环境变量中的 GCP 凭证
```

### 方法：`detect_shots()`

#### 函数签名
```python
async def detect_shots(
    video_uri: str,
    cleanup_temp: bool = True
) -> list[dict]
```

#### 参数
| 参数 | 类型 | 必需 | 说明 |
|-----|------|------|------|
| `video_uri` | `str` | ✅ | 视频URI，支持 GCS URI (`gs://...`) 或本地文件路径 |
| `cleanup_temp` | `bool` | ❌ | 是否清理临时 GCS 文件（默认: `True`） |

#### 返回值结构

**类型**: `list[dict]`

**每个镜头的结构**:
```python
{
    "start_time": float,  # 开始时间（秒）
    "end_time": float,    # 结束时间（秒）
    "duration": float     # 持续时间（秒）
}
```

#### 完整示例

```python
service = VideoIntelligenceService()

# 使用本地文件
shots = await service.detect_shots("/path/to/video.mp4")

# 使用 GCS URI
shots = await service.detect_shots("gs://my-bucket/video.mp4")

# 返回结果示例
print(shots)
# [
#     {"start_time": 0.04, "end_time": 1.96, "duration": 1.92},
#     {"start_time": 2.00, "end_time": 2.40, "duration": 0.40},
#     {"start_time": 2.44, "end_time": 4.08, "duration": 1.64},
#     ...
# ]

# 处理结果
for i, shot in enumerate(shots, 1):
    print(f"Shot {i}: {shot['start_time']:.2f}s - {shot['end_time']:.2f}s")
```

#### 实际测试结果（Rick Astley 视频）

```python
Total shots: 99

Shot 1: {"start_time": 0.04, "end_time": 1.96, "duration": 1.92}
Shot 2: {"start_time": 2.00, "end_time": 2.40, "duration": 0.40}
Shot 3: {"start_time": 2.44, "end_time": 4.08, "duration": 1.64}
Shot 4: {"start_time": 4.12, "end_time": 5.24, "duration": 1.12}
Shot 5: {"start_time": 5.28, "end_time": 7.40, "duration": 2.12}
... (94 more shots)
```

---

## 2. Gemini ASR Service - 音频/视频转录

### 导入
```python
from master_clash.services import GeminiASRService
```

### 初始化
```python
service = GeminiASRService(model="gemini-2.0-flash-exp")
# 可选参数:
# - model: Gemini 模型名称（默认: "gemini-2.0-flash-exp"）
```

### 方法 1：`transcribe_audio()`

#### 函数签名
```python
async def transcribe_audio(
    audio_path: str,
    language: str | None = None
) -> str
```

#### 参数
| 参数 | 类型 | 必需 | 说明 |
|-----|------|------|------|
| `audio_path` | `str` | ✅ | 音频文件路径（支持 MP3, WAV 等） |
| `language` | `str` | ❌ | 语言代码（如 "zh", "en"），`None` 为自动检测 |

#### 返回值结构

**类型**: `str`

纯文本转录结果，包含：
- 完整的转录文本
- 对不清晰部分标记 `[不清晰]`
- 自动添加标点符号
- 保持原始语序

#### 示例

```python
service = GeminiASRService()

# 转录音频（中文）
transcript = await service.transcribe_audio("/path/to/audio.mp3", language="zh")

# 转录音频（英文）
transcript = await service.transcribe_audio("/path/to/audio.mp3", language="en")

# 自动检测语言
transcript = await service.transcribe_audio("/path/to/audio.mp3")

print(transcript)
# "We're no strangers to love. You know the rules and so do I..."
```

### 方法 2：`transcribe_video()`

#### 函数签名
```python
async def transcribe_video(
    video_path: str,
    language: str | None = None,
    cleanup_audio: bool = True
) -> str
```

#### 参数
| 参数 | 类型 | 必需 | 说明 |
|-----|------|------|------|
| `video_path` | `str` | ✅ | 视频文件路径 |
| `language` | `str` | ❌ | 语言代码（如 "zh", "en"），`None` 为自动检测 |
| `cleanup_audio` | `bool` | ❌ | 是否删除临时音频文件（默认: `True`） |

#### 返回值结构

**类型**: `str`

纯文本转录结果（与 `transcribe_audio()` 相同）

#### 示例

```python
service = GeminiASRService()

# 转录视频
transcript = await service.transcribe_video("/path/to/video.mp4", language="zh")

print(transcript)
```

#### 实际测试结果（Rick Astley 视频）

```python
transcript = await service.transcribe_video("/tmp/test_video.mp4", language="zh")

print(f"Length: {len(transcript)} chars")
# Length: 1685 chars

print(transcript)
# We're no strangers to love. You know the rules and so do I.
# I've full commitment's what I'm thinking of
# You wouldn't get this from any other guy.
# I just wanna tell you how I'm feeling
# Gotta make you understand
#
# Never gonna give you up
# Never gonna let you down
# Never gonna run around and desert you
# Never gonna make you cry
# Never gonna say goodbye
# Never gonna tell a lie and hurt you
#
# We've known each other for so long
# Your heart's been aching but you're too shy to say it.
# ...
# [不清晰] if you up
# [不清晰] if you up
# ...
```

---

## 完整使用示例

### 示例 1: 分析视频的镜头和内容

```python
from master_clash.services import VideoIntelligenceService, GeminiASRService

async def analyze_video_complete(video_path: str):
    """完整分析视频：镜头检测 + 音频转录"""

    # 1. 检测镜头
    vi_service = VideoIntelligenceService()
    shots = await vi_service.detect_shots(video_path)

    print(f"Total shots: {len(shots)}")
    for i, shot in enumerate(shots[:5], 1):
        print(f"  Shot {i}: {shot['start_time']:.2f}s - {shot['end_time']:.2f}s")

    # 2. 转录音频
    asr_service = GeminiASRService()
    transcript = await asr_service.transcribe_video(video_path, language="en")

    print(f"\nTranscript ({len(transcript)} chars):")
    print(transcript[:500] + "...")

    return {
        "shots": shots,
        "transcript": transcript
    }

# 使用
result = await analyze_video_complete("/path/to/video.mp4")
```

### 示例 2: 生成时间轴字幕

```python
async def create_timeline_with_transcript(video_path: str):
    """结合镜头和转录生成时间轴"""

    vi_service = VideoIntelligenceService()
    asr_service = GeminiASRService()

    # 并行执行
    shots, transcript = await asyncio.gather(
        vi_service.detect_shots(video_path),
        asr_service.transcribe_video(video_path, language="en")
    )

    # 生成时间轴
    timeline = {
        "total_duration": shots[-1]["end_time"] if shots else 0,
        "total_shots": len(shots),
        "shots": shots,
        "full_transcript": transcript,
    }

    return timeline

# 使用
timeline = await create_timeline_with_transcript("/path/to/video.mp4")
print(f"Duration: {timeline['total_duration']:.2f}s")
print(f"Shots: {timeline['total_shots']}")
```

### 示例 3: 批量处理

```python
async def batch_analyze_videos(video_paths: list[str]):
    """批量分析多个视频"""

    vi_service = VideoIntelligenceService()
    asr_service = GeminiASRService()

    results = []

    for path in video_paths:
        print(f"Processing: {path}")

        # 分析单个视频
        shots = await vi_service.detect_shots(path)
        transcript = await asr_service.transcribe_video(path)

        results.append({
            "path": path,
            "shots_count": len(shots),
            "transcript_length": len(transcript),
            "shots": shots,
            "transcript": transcript,
        })

    return results

# 使用
videos = ["/path/to/video1.mp4", "/path/to/video2.mp4"]
results = await batch_analyze_videos(videos)
```

---

## 错误处理

### Video Intelligence Service

```python
try:
    shots = await service.detect_shots(video_path)
except FileNotFoundError as e:
    print(f"Video file not found: {e}")
except Exception as e:
    print(f"Shot detection failed: {e}")
```

**常见错误**:
- `FileNotFoundError`: 本地文件不存在
- `PermissionDenied`: API 未启用或权限不足
- `google.api_core.exceptions.GoogleAPIError`: API 调用失败

### Gemini ASR Service

```python
try:
    transcript = await service.transcribe_video(video_path)
except RuntimeError as e:
    if "FFmpeg" in str(e):
        print("FFmpeg not installed. Install: brew install ffmpeg")
    else:
        print(f"Transcription failed: {e}")
except Exception as e:
    print(f"ASR error: {e}")
```

**常见错误**:
- `RuntimeError("FFmpeg not found")`: FFmpeg 未安装
- `ValueError("GCS_BUCKET_NAME not configured")`: GCS 配置缺失
- API 调用失败

---

## 环境变量配置

### 必需的环境变量

```bash
# Google Cloud 配置
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json

# GCS 配置
GCS_BUCKET_NAME=your-bucket-name

# Gemini API Key
GOOGLE_API_KEY=your-gemini-api-key
```

### 可选的环境变量

```bash
# 自定义模型
GEMINI_ASR_MODEL=gemini-2.0-flash-exp

# GCS 公共 URL（如果需要）
R2_PUBLIC_URL=https://your-bucket.r2.dev
```

---

## 性能和成本

### Video Intelligence API

| 指标 | 值 |
|-----|-----|
| **处理时间** | ~2-3 分钟（取决于视频长度） |
| **成本** | $0.10 / 分钟视频 |
| **精确度** | 非常高（专业 AI 模型） |
| **最大视频长度** | 无限制 |

### Gemini ASR

| 指标 | 值 |
|-----|-----|
| **处理时间** | ~1-2 分钟（取决于音频长度） |
| **成本** | 按输入 tokens 计费 |
| **精确度** | 高（但不如专业 ASR） |
| **支持语言** | 100+ 语言 |
| **最大音频长度** | ~1 小时 |

---

## 下一步

- 集成到视频分析工作流
- 添加字幕生成功能
- 实现批量处理队列
- 添加缓存机制
