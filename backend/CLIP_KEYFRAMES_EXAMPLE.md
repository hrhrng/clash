# CLIP 关键帧检测 - 快速入门

## 什么是 CLIP 关键帧检测？

CLIP (Contrastive Language-Image Pre-training) 是 OpenAI 开发的视觉-语言模型。用于关键帧检测时，它能：

- 🧠 **理解语义**：不只看像素，还理解内容
- 🎯 **精准切分**：基于场景内容而非视觉变化
- 💪 **鲁棒性强**：对光照、角度、缩放变化不敏感

## 快速开始

### 1. 安装依赖

```bash
cd backend
uv sync  # 已包含所有依赖
```

### 2. 基础使用

```python
import asyncio
from master_clash.video_analysis import CLIPKeyframeDetector

async def main():
    # 创建检测器
    detector = CLIPKeyframeDetector(
        model_name="openai/clip-vit-base-patch32",
        distance_threshold=0.3,
        frame_sample_rate=3,
        device="auto"  # 自动选择 GPU/CPU
    )

    # 检测关键帧
    keyframes = await detector.detect_keyframes_async(
        video_path="your_video.mp4",
        save_images=True,
        save_curve=True  # 保存距离曲线图
    )

    # 查看结果
    for kf in keyframes:
        print(f"时间: {kf.timestamp:.2f}s, 帧号: {kf.frame_number}")

asyncio.run(main())
```

### 3. 便捷函数

```python
from master_clash.video_analysis.keyframes_clip import (
    detect_with_clip_fast,      # 快速模式
    detect_with_clip_accurate,  # 精确模式
    detect_with_clip_balanced   # 平衡模式（推荐）
)

# 一行代码搞定
keyframes = detect_with_clip_balanced("video.mp4")
```

## 工作原理

### 1. 提取语义特征

```python
视频帧 → CLIP → 512维嵌入向量

帧1: [人物, 室内, 家具] → [0.23, -0.45, 0.12, ...]
帧2: [人物, 室内, 家具] → [0.25, -0.43, 0.14, ...]  # 相似
帧3: [户外, 街道, 建筑] → [0.85, 0.32, -0.67, ...]  # 不同
```

### 2. 计算距离曲线

```python
余弦距离 = 1 - cosine_similarity(embedding1, embedding2)

帧1→帧2: 距离 = 0.05 (相似)
帧2→帧3: 距离 = 0.65 (不同) ← 峰值，检测为场景切换
```

### 3. 峰值检测

```
距离曲线：
 |     *
 |    * *              *
 |   *   *            * *
 |  *     *          *   *
 | *       *    *   *     *
 |*         ****  **       **
 +-------------------------> 时间
           ↑    ↑
         场景   场景
         切换   切换
```

## 参数调优

### 采样率（性能优化）

```python
# 快速模式 - 长视频（>30分钟）
frame_sample_rate=5  # 每5帧采样一次
# 处理速度: 约5倍提升
# 准确度: 轻微下降

# 标准模式 - 一般视频
frame_sample_rate=3  # 推荐
# 平衡速度和准确度

# 精确模式 - 短视频或关键内容
frame_sample_rate=1  # 每帧都分析
# 最高准确度，速度较慢
```

### 阈值调整

```python
# 敏感模式 - 检测更多场景
CLIPKeyframeDetector(
    distance_threshold=0.2,   # 低阈值
    peak_prominence=0.05      # 低显著性
)
# 结果: 更多关键帧

# 保守模式 - 只检测明显变化
CLIPKeyframeDetector(
    distance_threshold=0.4,   # 高阈值
    peak_prominence=0.2       # 高显著性
)
# 结果: 更少但更显著的关键帧
```

### 模型选择

```python
# 基础模型（推荐）
model_name="openai/clip-vit-base-patch32"
# 大小: ~600MB
# 速度: 快
# 准确度: 高（足够用）

# 大模型（研究级）
model_name="openai/clip-vit-large-patch14"
# 大小: ~900MB
# 速度: 较慢
# 准确度: 最高
```

## 实际案例

### 案例 1: 电影分析

```python
detector = CLIPKeyframeDetector(
    model_name="openai/clip-vit-base-patch32",
    distance_threshold=0.3,
    peak_prominence=0.15,  # 较高显著性
    frame_sample_rate=2,
    device="cuda"
)

keyframes = await detector.detect_keyframes_async(
    "movie.mp4",
    save_curve=True,
    max_keyframes=100
)
```

**结果**:
- 准确识别场景切换（室内→户外、白天→夜晚）
- 忽略相机切换（同一场景的不同角度）
- 捕捉情节转折点

### 案例 2: Vlog 分割

```python
from master_clash.video_analysis.keyframes_clip import detect_with_clip_balanced

keyframes = detect_with_clip_balanced(
    "travel_vlog.mp4",
    save_images=True
)

# 自动分割：海滩 → 餐厅 → 酒店 → 景点
```

### 案例 3: 教育视频

```python
detector = CLIPKeyframeDetector(
    distance_threshold=0.25,  # 敏感模式
    frame_sample_rate=2,      # 较高精度
)

keyframes = await detector.detect_keyframes_async(
    "lecture.mp4",
    save_images=True
)

# 捕捉 PPT 切换和演示内容变化
```

## 输出示例

### 1. 关键帧列表

```python
[
    Keyframe(
        timestamp=0.0,
        frame_number=0,
        image_path="keyframes/keyframe_000000_0.00s.jpg",
        score=1.0
    ),
    Keyframe(
        timestamp=15.5,
        frame_number=465,
        image_path="keyframes/keyframe_000465_15.50s.jpg",
        score=1.0
    ),
    ...
]
```

### 2. 距离曲线图

设置 `save_curve=True` 会生成 `distance_curve.png`：

```
输出目录/
├── keyframes/
│   ├── keyframe_000000_0.00s.jpg
│   ├── keyframe_000465_15.50s.jpg
│   └── ...
└── distance_curve.png  ← 可视化距离曲线
```

## 性能优化技巧

### GPU 加速

```python
# 自动检测（推荐）
detector = CLIPKeyframeDetector(device="auto")

# 检查是否使用 GPU
import torch
print(f"CUDA 可用: {torch.cuda.is_available()}")
print(f"当前设备: {detector.device}")
```

**性能对比**:
- GPU (NVIDIA RTX 3080): ~0.5秒/帧
- CPU (Intel i9): ~2秒/帧

### 内存优化

```python
# 增加采样率减少内存占用
detector = CLIPKeyframeDetector(
    frame_sample_rate=5,  # 内存占用减少 5 倍
)

# 处理超长视频时分段处理
# （在编排器中自动处理）
```

### 批处理

```python
# 处理多个视频
videos = ["video1.mp4", "video2.mp4", "video3.mp4"]

for video in videos:
    keyframes = detect_with_clip_balanced(video)
    print(f"{video}: {len(keyframes)} 关键帧")
```

## 故障排除

### 问题 1: 模型下载失败

```bash
# 手动设置 HuggingFace 缓存目录
export HF_HOME=/path/to/cache

# 或使用镜像
export HF_ENDPOINT=https://hf-mirror.com
```

### 问题 2: GPU 内存不足

```python
# 方案1: 增加采样率
frame_sample_rate=5

# 方案2: 使用 CPU
device="cpu"

# 方案3: 使用小模型
model_name="openai/clip-vit-base-patch32"
```

### 问题 3: 检测到太多关键帧

```python
# 增加阈值和显著性
detector = CLIPKeyframeDetector(
    distance_threshold=0.4,   # 从 0.3 提高到 0.4
    peak_prominence=0.2,      # 从 0.1 提高到 0.2
    min_interval=2.0          # 最小间隔 2 秒
)
```

### 问题 4: 检测到太少关键帧

```python
# 降低阈值
detector = CLIPKeyframeDetector(
    distance_threshold=0.2,   # 从 0.3 降低到 0.2
    peak_prominence=0.05,     # 从 0.1 降低到 0.05
)
```

## 对比其他方法

| 方法 | 同一场景不同角度 | 不同场景相似光照 | 渐变场景 |
|------|------------------|------------------|----------|
| 灰度直方图 | ❌ 误判 | ❌ 漏判 | ❌ 误判 |
| PySceneDetect | ⚠️ 可能误判 | ✅ 正确 | ✅ 正确 |
| **CLIP** | ✅ **正确** | ✅ **正确** | ✅ **正确** |

## 总结

**CLIP 关键帧检测最适合**:
- ✅ 复杂视频（电影、纪录片、Vlog）
- ✅ 需要理解内容而非仅视觉
- ✅ 光照、角度变化频繁的视频
- ✅ 研究级应用

**权衡考虑**:
- ⚖️ 需要下载较大模型（首次）
- ⚖️ GPU 加速效果显著
- ⚖️ 比传统方法慢，但准确度高得多

**快速决策**:
```python
# 有 GPU + 复杂视频 → CLIP
detector = CLIPKeyframeDetector(device="cuda")

# 无 GPU / 简单视频 → PySceneDetect
from master_clash.video_analysis import PySceneDetectKeyframeDetector
detector = PySceneDetectKeyframeDetector()

# 快速测试 → 基础版
from master_clash.video_analysis import KeyframeDetector
detector = KeyframeDetector()
```

查看 [KEYFRAME_ALGORITHMS.md](src/master_clash/video_analysis/KEYFRAME_ALGORITHMS.md) 了解所有算法的详细对比！
