# Kling KIE API 快速参考

## 功能概览

| 功能 | 模型 | 输入 | 输出 |
|------|------|------|------|
| 文生视频 | `kling/v2-5-turbo-text-to-video-pro` | 文字描述 + 宽高比 | 视频 URL |
| 图生视频 | `kling/v2-5-turbo-image-to-video-pro` | 图片 URL + 文字描述 | 视频 URL |

## 快速开始

### 1. 文生视频（Text-to-Video）

```python
from master_clash.tools.kling_kie import text_to_video

video_url = text_to_video(
    prompt="描述你想要的视频场景",
    duration="5",           # "5" 或 "10" 秒
    aspect_ratio="16:9"     # "16:9", "9:16", 或 "1:1"
)
```

### 2. 图生视频（Image-to-Video）

```python
from master_clash.tools.kling_kie import image_to_video

video_url = image_to_video(
    image_url="https://example.com/your-image.jpg",
    prompt="描述你想要的动画效果",
    duration="5"            # "5" 或 "10" 秒
)
```

## 参数说明

### 通用参数

| 参数 | 类型 | 必需 | 可选值 | 默认值 | 说明 |
|------|------|------|--------|--------|------|
| `prompt` | str | ✅ | - | - | 视频描述 (最多 2500 字符) |
| `duration` | str | ❌ | `"5"`, `"10"` | `"5"` | 视频时长（秒） |
| `negative_prompt` | str | ❌ | - | `"blur, distort, and low quality"` | 要避免的内容 |
| `cfg_scale` | float | ❌ | 0.0 - 1.0 | 0.5 | 引导强度 (越高越贴近提示词) |

### 文生视频专用参数

| 参数 | 类型 | 必需 | 可选值 | 默认值 | 说明 |
|------|------|------|--------|--------|------|
| `aspect_ratio` | str | ❌ | `"16:9"`, `"9:16"`, `"1:1"` | `"16:9"` | 视频宽高比 |

### 图生视频专用参数

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `image_url` | str | ✅ | 图片 URL (最大 10MB, jpeg/png/webp) |
| `tail_image_url` | str | ❌ | 结束帧图片 URL (可选) |

## 常用场景示例

### 场景 1: 风景视频

```python
video_url = text_to_video(
    prompt="日出时分，云海翻涌，相机缓慢向前推进",
    duration="10",
    aspect_ratio="16:9"
)
```

### 场景 2: 人像动画

```python
video_url = image_to_video(
    image_url="https://example.com/portrait.jpg",
    prompt="人物微笑并轻轻点头，自然的面部表情",
    duration="5"
)
```

### 场景 3: 社交媒体竖版视频

```python
video_url = text_to_video(
    prompt="咖啡拉花特写，蒸汽上升，相机缓慢移动",
    duration="5",
    aspect_ratio="9:16"  # 竖版
)
```

### 场景 4: 产品展示动画

```python
video_url = image_to_video(
    image_url="https://example.com/product.jpg",
    prompt="相机360度旋转，展示产品各个角度",
    duration="10"
)
```

## 高级用法

### 异步任务处理

```python
from master_clash.tools.kling_kie import KlingKIEVideoGenerator

generator = KlingKIEVideoGenerator()

# 创建任务
task_id = generator.create_image_to_video_task(
    image_url="https://example.com/image.jpg",
    prompt="相机缓慢推进",
    duration="5"
)

# 稍后查询状态
status = generator.query_task(task_id)
if status.get('state') == 'success':
    import json
    result = json.loads(status['resultJson'])
    video_url = result['resultUrls'][0]
```

### 批量处理

```python
generator = KlingKIEVideoGenerator()

# 创建多个任务
task_ids = []
for image_url in image_urls:
    task_id = generator.create_image_to_video_task(
        image_url=image_url,
        prompt="相机缓慢移动",
        duration="5"
    )
    task_ids.append(task_id)

# 批量查询状态
for task_id in task_ids:
    status = generator.query_task(task_id)
    # 处理结果...
```

## 提示词技巧

### 好的提示词特征

✅ **具体明确**
```
"日落时分，金色阳光洒在山顶，云朵缓缓飘动，相机从左向右平移"
```

✅ **包含动作描述**
```
"人物微笑并挥手，头部轻微转动，眼神看向镜头"
```

✅ **描述相机运动**
```
"相机缓慢推进，聚焦在主体上，背景虚化"
```

### 避免的做法

❌ **过于简单**
```
"日落"  # 太简单
```

❌ **没有动作**
```
"一张静止的风景照片"  # 缺少动态元素
```

## 定价参考

- **5秒视频**: 42 积分 ($0.21)
- **10秒视频**: 84 积分 ($0.42)

## 错误处理

```python
from master_clash.tools.kling_kie import image_to_video

try:
    video_url = image_to_video(
        image_url="https://example.com/image.jpg",
        prompt="相机缓慢移动",
        duration="5"
    )
    print(f"成功: {video_url}")

except ValueError as e:
    print(f"参数错误: {e}")

except RuntimeError as e:
    print(f"生成失败: {e}")

except TimeoutError as e:
    print(f"超时: {e}")
```

## 常见错误代码

| 错误码 | 说明 | 解决方法 |
|--------|------|----------|
| 401 | 认证失败 | 检查 `KIE_API_KEY` 是否正确 |
| 402 | 余额不足 | 充值账户 |
| 422 | 参数验证失败 | 检查参数格式和范围 |
| 429 | 请求频率超限 | 降低请求频率 |
| 500 | 服务器错误 | 稍后重试 |

## 性能优化建议

1. **使用异步模式**: 对于批量任务，先创建所有任务，再统一查询状态
2. **合理设置超时**: 根据视频时长调整 `max_wait_time`
   - 5秒视频: 建议 120-180 秒
   - 10秒视频: 建议 180-300 秒
3. **使用回调 URL**: 对于长时间任务，使用 `callback_url` 接收通知
4. **缓存结果**: 对于相同的输入，可以缓存视频 URL

## 相关链接

- [完整文档](./kling_kie_usage.md)
- [示例代码](./kling_kie_image_to_video_example.py)
- [KIE.ai 官网](https://kie.ai)
- [API 密钥管理](https://kie.ai/api-key)
