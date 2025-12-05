# 关键帧检测算法对比

## 可用的检测器

### 1. **KeyframeDetector** (基础版)
📁 `keyframes.py`

**算法**: 灰度直方图相关性

**优点**:
- ✅ 简单快速
- ✅ 无额外依赖
- ✅ 适合快速原型

**缺点**:
- ❌ 只考虑亮度分布，忽略空间信息
- ❌ 对相机运动不够敏感
- ❌ 对渐变场景可能误判

**适用场景**:
- 快速测试
- 简单视频（明显的场景切换）

**使用示例**:
```python
from master_clash.video_analysis import KeyframeDetector

detector = KeyframeDetector(threshold=30.0, min_interval=1.0)
keyframes = await detector.detect_keyframes_async("video.mp4")
```

---

### 2. **AdvancedKeyframeDetector** (高级版)
📁 `keyframes_advanced.py`

**算法**: 多算法融合
- 灰度直方图（快速预筛）
- SSIM 结构相似性（主要判断）
- HSV 颜色直方图（可选）
- 边缘变化检测（可选）

**优点**:
- ✅ 准确度高
- ✅ 可配置算法组合
- ✅ 适应性强

**缺点**:
- ❌ 速度较慢（比基础版慢 2-3倍）
- ❌ 需要额外依赖 (`scikit-image`)

**适用场景**:
- 需要高质量关键帧
- 复杂视频（光照变化、相机运动）
- 精细场景分析

**使用示例**:
```python
from master_clash.video_analysis import AdvancedKeyframeDetector

# 混合模式（推荐）
detector = AdvancedKeyframeDetector(
    method="hybrid",
    threshold=0.3,
    use_color=True,
    use_edges=True
)
keyframes = await detector.detect_keyframes_async("video.mp4")

# 或使用便捷函数
from master_clash.video_analysis.keyframes_advanced import detect_keyframes_balanced
keyframes = detect_keyframes_balanced("video.mp4")
```

**可用方法**:
- `histogram`: 仅灰度直方图（最快）
- `ssim`: 仅 SSIM（准确）
- `color`: 仅颜色直方图
- `edges`: 仅边缘检测
- `hybrid`: 混合算法（推荐）

---

### 3. **PySceneDetectKeyframeDetector** ⭐ **最推荐**
📁 `keyframes_pyscenedetect.py`

**算法**: PySceneDetect 库提供的多种成熟算法

**优点**:
- ✅ 业界标准，久经考验
- ✅ 多种检测器可选
- ✅ 性能优化良好
- ✅ 持续维护和更新
- ✅ 准确度高

**缺点**:
- ❌ 需要额外依赖 (`scenedetect`)

**适用场景**:
- **生产环境（强烈推荐）**
- 所有类型的视频
- 需要可靠性和准确性

**使用示例**:
```python
from master_clash.video_analysis import PySceneDetectKeyframeDetector

# ContentDetector（推荐，快速且准确）
detector = PySceneDetectKeyframeDetector(
    detector_type="content",
    threshold=27.0,
    min_scene_len=1.0
)
keyframes = await detector.detect_keyframes_async("video.mp4")

# 或使用便捷函数
from master_clash.video_analysis.keyframes_pyscenedetect import detect_scenes_fast
keyframes = detect_scenes_fast("video.mp4")
```

**可用检测器**:
- `content`: 内容检测器（推荐）
  - 基于帧差异
  - 适合大多数视频
  - 阈值范围: 15-100，默认 27
- `adaptive`: 自适应检测器
  - 动态调整阈值
  - 适合光照变化大的视频
- `threshold`: 阈值检测器
  - 最快
  - 适合简单场景

---

---

### 4. **CLIPKeyframeDetector** 🚀 **最先进**
📁 `keyframes_clip.py`

**算法**: 基于 CLIP 的语义距离曲线

**优点**:
- ✅ **语义级别**的场景理解（最大优势）
- ✅ 对光照、角度、缩放变化极其鲁棒
- ✅ 能识别内容相似但视觉不同的场景
- ✅ 适合复杂视频（电影、纪录片、Vlog）
- ✅ 可视化距离曲线，便于调试

**缺点**:
- ❌ 需要较大的模型（~600MB）
- ❌ 首次运行需下载模型
- ❌ 需要 GPU 才能达到最佳性能（CPU 也可用但较慢）
- ❌ 内存占用较高

**适用场景**:
- **复杂视频分析（最推荐）**
- 电影、纪录片、教育视频
- 需要理解内容而非仅视觉变化
- 研究级应用

**使用示例**:
```python
from master_clash.video_analysis import CLIPKeyframeDetector

# 平衡模式（推荐）
detector = CLIPKeyframeDetector(
    model_name="openai/clip-vit-base-patch32",
    distance_threshold=0.3,
    peak_prominence=0.1,
    frame_sample_rate=3,
    device="auto"  # 自动选择 GPU/CPU
)
keyframes = await detector.detect_keyframes_async(
    "video.mp4",
    save_curve=True  # 保存距离曲线可视化
)

# 或使用便捷函数
from master_clash.video_analysis.keyframes_clip import detect_with_clip_balanced
keyframes = detect_with_clip_balanced("video.mp4")
```

**可用模型**:
- `openai/clip-vit-base-patch32`: 基础模型（推荐，~600MB）
  - 快速
  - 准确度高
  - 适合大多数场景
- `openai/clip-vit-large-patch14`: 大模型（~900MB）
  - 更准确
  - 较慢
  - 适合研究级应用

**核心原理**:
```
1. 使用 CLIP 提取每帧的语义嵌入向量（512维）
2. 计算相邻帧嵌入的余弦距离
3. 构建距离曲线
4. 使用峰值检测算法找到曲线的峰值
5. 峰值对应场景切换点
```

**为什么 CLIP 更好？**
- 传统方法看"像素"，CLIP 看"内容"
- 例子：同一个人在不同光照下
  - 传统方法：可能误判为不同场景
  - CLIP：正确识别为同一场景
- 例子：两个不同的室内场景，光照相似
  - 传统方法：可能漏判
  - CLIP：正确检测到内容变化

---

## 性能对比

| 检测器 | 速度 | 准确度 | 语义理解 | 适应性 | 推荐度 |
|--------|------|--------|----------|--------|--------|
| KeyframeDetector | ⚡⚡⚡⚡ 快 | ⭐⭐ 中 | ❌ 无 | ⭐⭐ 中 | 适合测试 |
| AdvancedKeyframeDetector | ⚡⚡ 中 | ⭐⭐⭐⭐ 高 | ❌ 无 | ⭐⭐⭐⭐ 高 | 适合精细分析 |
| PySceneDetectKeyframeDetector | ⚡⚡⚡ 快 | ⭐⭐⭐⭐⭐ 很高 | ❌ 无 | ⭐⭐⭐⭐⭐ 很高 | **生产推荐** |
| CLIPKeyframeDetector | ⚡⚡ 中等† | ⭐⭐⭐⭐⭐⭐ 最高 | ✅ **强** | ⭐⭐⭐⭐⭐⭐ 最高 | **复杂视频首选** |

† GPU 加速下可达 ⚡⚡⚡ 快

## 算法详解

### 灰度直方图相关性
- **原理**: 比较相邻帧的亮度分布
- **优点**: 快速
- **缺点**: 只看整体亮度，忽略空间位置

### SSIM (结构相似性)
- **原理**: 比较亮度、对比度和结构
- **优点**: 考虑空间信息，更准确
- **缺点**: 计算量较大

### HSV 颜色直方图
- **原理**: 比较色调、饱和度、亮度分布
- **优点**: 对颜色变化敏感
- **缺点**: 对光照变化敏感

### 边缘检测
- **原理**: 比较 Canny 边缘的变化
- **优点**: 对内容结构变化敏感
- **缺点**: 对噪声敏感

### PySceneDetect ContentDetector
- **原理**: 基于像素差异和自适应阈值
- **优点**: 经过大量视频测试，非常可靠
- **缺点**: 需要额外依赖

## 选择建议

### 🎯 快速选择指南

**场景 1: 复杂视频分析（电影、纪录片、Vlog）** 🚀
```python
from master_clash.video_analysis import CLIPKeyframeDetector

detector = CLIPKeyframeDetector(
    model_name="openai/clip-vit-base-patch32",
    frame_sample_rate=3,
    device="auto"
)
```
理由: 语义级理解，最强适应性，最高准确度

**场景 2: 生产环境（一般视频）**
```python
from master_clash.video_analysis import PySceneDetectKeyframeDetector

detector = PySceneDetectKeyframeDetector(detector_type="content")
```
理由: 可靠、快速、经过充分测试

**场景 3: 原型开发/测试**
```python
from master_clash.video_analysis import KeyframeDetector

detector = KeyframeDetector()
```
理由: 简单快速，无额外依赖

**场景 4: 研究/精细分析（像素级）**
```python
from master_clash.video_analysis import AdvancedKeyframeDetector

detector = AdvancedKeyframeDetector(method="hybrid")
```
理由: 高准确度，可定制

### 📊 按视频类型选择

**电影/电视剧/纪录片** 🎬
- 首选: **CLIPKeyframeDetector**
- 备选: PySceneDetectKeyframeDetector (content)
- 理由: 需要理解内容变化，光照、角度变化频繁

**Vlog/旅行视频** ✈️
- 首选: **CLIPKeyframeDetector**
- 理由: 场景多样，内容变化丰富

**教育/讲座视频** 📚
- 首选: **CLIPKeyframeDetector** (低采样率)
- 备选: PySceneDetectKeyframeDetector (adaptive)
- 理由: 需要捕捉 PPT 切换和讲师动作

**监控视频** 📹
- 推荐: AdvancedKeyframeDetector (hybrid + edges)
- 理由: 需要捕捉细微变化

**演示/幻灯片** 💻
- 推荐: PySceneDetectKeyframeDetector (content, 低阈值)
- 理由: 场景切换明确

**动画/游戏** 🎮
- 首选: **CLIPKeyframeDetector**
- 备选: AdvancedKeyframeDetector (hybrid + color)
- 理由: 语义变化比视觉变化更重要

**直播/会议** 💬
- 推荐: PySceneDetectKeyframeDetector (adaptive)
- 理由: 光照变化可能较大，快速

**体育比赛** ⚽
- 首选: **CLIPKeyframeDetector**
- 理由: 能区分不同的比赛时刻（进球、犯规等）

## 安装依赖

### 基础版（无额外依赖）
```bash
# 已包含在核心依赖中
uv sync
```

### 完整版（包含所有算法）
```bash
# 已在 pyproject.toml 中定义
uv sync

# 包含以下包：
# - opencv-python (所有版本需要)
# - scenedetect[opencv] (PySceneDetect)
# - scikit-image (高级算法)
# - transformers + torch (CLIP)
# - scipy (峰值检测)
# - matplotlib (可视化)
```

### 仅 CLIP 算法
```bash
pip install transformers torch pillow scipy matplotlib
```

**注意**:
- CLIP 需要下载模型（首次运行）
  - Base 模型: ~600MB
  - Large 模型: ~900MB
- 建议使用 GPU 加速（但 CPU 也可用）

## 在编排器中使用

你可以在 `VideoAnalysisOrchestrator` 中指定使用哪个检测器：

```python
from master_clash.video_analysis import (
    VideoAnalysisOrchestrator,
    VideoAnalysisConfig,
    PySceneDetectKeyframeDetector
)

# 创建自定义检测器
keyframe_detector = PySceneDetectKeyframeDetector(
    detector_type="content",
    threshold=27.0
)

# 配置
config = VideoAnalysisConfig(
    enable_keyframe_detection=True,
    # 其他配置...
)

# 创建编排器
orchestrator = VideoAnalysisOrchestrator(config)

# 手动替换检测器
orchestrator.keyframe_detector = keyframe_detector

# 运行分析
result = await orchestrator.analyze_video("video.mp4")
```

## 总结

**最佳实践推荐**:

1. **生产环境**: 使用 `PySceneDetectKeyframeDetector`
   - 成熟稳定
   - 性能优异
   - 持续维护

2. **快速原型**: 使用 `KeyframeDetector`
   - 简单直接
   - 零额外依赖

3. **研究分析**: 使用 `AdvancedKeyframeDetector`
   - 可定制性强
   - 准确度最高

**性能建议**:
- 对于长视频（>30分钟），优先使用 PySceneDetect 或 CLIP（高采样率）
- 对于短视频（<5分钟），任何算法都可以
- 考虑使用 `min_scene_len` 参数避免过多关键帧
- CLIP 在 GPU 上处理 1080p 视频约 0.5-1 秒/帧

## CLIP 算法深入解析

### 为什么 CLIP 是游戏改变者？

**传统方法的局限**:
```python
# 传统方法：比较像素
帧1: 室内，白天，人物A在左边
帧2: 室内，白天，人物A在右边
结果: 检测到场景变化 ❌（实际是同一场景）

帧3: 室内A，黄昏光照
帧4: 室内B，黄昏光照
结果: 未检测到场景变化 ❌（实际是不同场景）
```

**CLIP 的优势**:
```python
# CLIP：理解语义
帧1: [人物, 室内, 家具, 窗户] -> embedding_1
帧2: [人物, 室内, 家具, 窗户] -> embedding_2
余弦距离: 0.05（非常相似）✅

帧3: [客厅, 沙发, 电视] -> embedding_3
帧4: [卧室, 床, 衣柜] -> embedding_4
余弦距离: 0.45（不同）✅
```

### 距离曲线可视化示例

```
距离
 ^
 |     *
 |    * *              *
 |   *   *            * *
 |  *     *          *   *
 | *       *    *   *     *
 |*         ****  **       **
 +-------------------------> 时间
  ^         ^    ^         ^
场景1     切换  切换      场景4
        到场景2 到场景3

峰值 = 场景切换点
```

### 调优技巧

**1. 调整采样率（性能 vs 准确度）**
```python
# 快速模式（长视频）
frame_sample_rate=5  # 每5帧一次，速度快

# 精确模式（短视频或重要内容）
frame_sample_rate=1  # 每帧都分析，最准确
```

**2. 调整阈值**
```python
# 敏感模式（检测更多场景）
distance_threshold=0.2  # 低阈值
peak_prominence=0.05    # 低显著性

# 保守模式（只检测明显变化）
distance_threshold=0.4  # 高阈值
peak_prominence=0.2     # 高显著性
```

**3. GPU 加速**
```python
# 自动检测
device="auto"  # 推荐

# 强制使用
device="cuda"  # GPU
device="cpu"   # CPU（慢但总是可用）
```

### 实际案例对比

**案例 1: 访谈节目**
- 传统方法: 每次相机切换都检测为新场景（过多）
- CLIP: 正确识别为同一访谈场景（准确）

**案例 2: 旅行 Vlog**
- 传统方法: 光照变化导致误判
- CLIP: 理解内容变化（海滩 → 山脉 → 城市）

**案例 3: 电影**
- 传统方法: 渐变镜头、移动镜头误判
- CLIP: 基于场景内容正确分割

### 最佳实践总结

| 场景 | 推荐算法 | 配置 |
|------|---------|------|
| 🎬 专业视频制作 | CLIP | base模型, sample_rate=2 |
| 🚀 生产环境 | PySceneDetect | content detector |
| ⚡ 快速原型 | KeyframeDetector | 默认配置 |
| 🔬 研究分析 | CLIP | large模型, sample_rate=1 |
| 💻 资源受限 | PySceneDetect | threshold detector |
