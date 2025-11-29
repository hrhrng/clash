# Kling AI Video Generation Integration Summary

## 概述

成功集成 Kling AI 图生视频 API,并参考 `nano_banana.py` 模式创建了完整的工具封装。

## 实现的功能

### 1. 核心 API 封装 (`src/master_clash/tools/kling.py`)

- ✅ **JWT 鉴权**: 使用 Access Key 和 Secret Key 生成 JWT token
- ✅ **图生视频 API**: 完整的 image2video API 集成
- ✅ **轮询机制**: 自动等待视频生成完成
- ✅ **Base64 支持**: 正确处理 base64 图片格式(无 data URI 前缀)
- ✅ **便捷函数**: `base64_to_video()`, `image_to_video()`

**关键发现:**
- API 端点: `https://api-beijing.klingai.com` (北京区域)
- Base64 格式: **不要**添加 `data:image/jpeg;base64,` 前缀
- 响应格式: `result["data"]["task_result"]["videos"][0]["url"]`

### 2. LangChain 工具封装 (`src/master_clash/tools/kling_video.py`)

参考 `nano_banana.py` 的设计模式,实现了:

- ✅ **视频注册表**: 类似图片注册表,管理生成的视频
- ✅ **自动命名**: `cat_animation_1`, `cat_animation_2` 等
- ✅ **自动保存**: 下载并保存到 `./output/` 目录
- ✅ **LangChain Tool**: `@tool` 装饰器,可用于 Agent

**核心函数:**
```python
# 简单生成
video_url = kling_video_gen(
    image_path="./assets/cat.png",
    prompt="猫咪摇头",
    duration=5
)

# Tool 包装(带注册和保存)
result = kling_video_tool(
    image_path="./assets/cat.png",
    prompt="猫咪摇头",
    base_name="cat_animation",
    duration=5,
    mode="std"
)
```

### 3. 文档和示例

- ✅ **完整文档**: `docs/kling_video_guide.md`
- ✅ **示例代码**: `examples/kling_video_example.py`
- ✅ **环境配置**: `.env.example` 已更新

## 文件结构

```
master-clash/
├── src/master_clash/tools/
│   ├── kling.py              # 核心 API 封装
│   └── kling_video.py        # LangChain 工具封装
├── examples/
│   └── kling_video_example.py  # 使用示例
├── docs/
│   └── kling_video_guide.md   # 完整文档
├── .env.example              # 环境变量模板
└── tests/
    ├── test_kling_*.py       # 测试文件

```

## 环境配置

在 `.env` 文件中添加:

```bash
KLING_ACCESS_KEY=your-access-key-here
KLING_SECRET_KEY=your-secret-key-here
```

## 使用示例

### 1. 基础用法

```python
from master_clash.tools.kling_video import kling_video_gen

video_url = kling_video_gen(
    image_path="./assets/cat.png",
    prompt="一只可爱的猫咪轻轻摇头",
    duration=5
)
```

### 2. 高级用法(带保存和注册)

```python
from master_clash.tools.kling_video import kling_video_tool

result = kling_video_tool(
    image_path="./assets/cat.png",
    prompt="一只可爱的猫咪轻轻摇头,背景虚化",
    base_name="cat_animation",
    duration=5,
    cfg_scale=0.5,
    negative_prompt="模糊,失真,低质量",
    mode="pro",
    model="kling-v1"
)

# 自动保存到: ./output/cat_animation_1.mp4
# 自动注册: "cat_animation_1"
```

### 3. 在 Agent 中使用

```python
from langchain.agents import create_agent
from master_clash.tools.kling_video import kling_video_tool, list_videos

tools = [kling_video_tool, list_videos]

agent = create_agent(
    model=model,
    tools=tools,
    system_prompt="You can generate videos from images..."
)
```

## API 参数说明

### 必需参数

- `image_path`: 图片路径
- `prompt`: 视频描述提示词

### 可选参数

- `duration`: 视频时长 (5 或 10 秒,默认 5)
- `mode`: 生成模式
  - `"std"` - 标准模式(快速,性价比高)
  - `"pro"` - 专家模式(高质量)
- `model`: 模型版本
  - `"kling-v1"` - 基础模型
  - `"kling-v1-5"` - 改进版
  - `"kling-v1-6"` - 最新版
  - `"kling-v2-master"` - 下一代
- `cfg_scale`: 引导强度 (0-1,默认 0.5)
- `negative_prompt`: 负面提示词

### 图片要求

- 格式: JPG, JPEG, PNG
- 大小: < 10MB
- 分辨率: 最小 300px
- 宽高比: 1:2.5 ~ 2.5:1

## 视频注册表功能

类似 `nano_banana.py` 的图片注册表:

```python
from master_clash.tools.kling_video import (
    register_video,
    get_video,
    list_registered_videos,
    clear_video_registry
)

# 注册视频
register_video("my_video", "https://...")

# 获取视频URL
url = get_video("my_video")

# 列出所有视频
videos = list_registered_videos()

# 清空注册表
clear_video_registry()
```

## 测试结果

✅ **JWT 鉴权测试**: 通过
✅ **API 调用测试**: 成功创建任务
✅ **视频生成测试**: 成功生成视频(需 3-5 分钟)
✅ **导入测试**: 所有模块正常导入

## 技术细节

### 1. JWT Token 生成

```python
import jwt
import time

headers = {"alg": "HS256", "typ": "JWT"}
payload = {
    "iss": access_key,
    "exp": int(time.time()) + 1800,  # 30 分钟有效期
    "nbf": int(time.time()) - 5       # 5 秒前开始生效
}
token = jwt.encode(payload, secret_key, headers=headers)
```

### 2. API 请求格式

```json
{
  "model_name": "kling-v1",
  "image": "base64_string_without_prefix",
  "duration": "5",
  "prompt": "描述文字",
  "cfg_scale": 0.5,
  "mode": "std"
}
```

### 3. API 响应格式

```json
{
  "code": 0,
  "message": "SUCCEED",
  "data": {
    "task_id": "123456789",
    "task_status": "submitted",
    "task_result": {
      "videos": [{
        "url": "https://...",
        "duration": "5"
      }]
    }
  }
}
```

## 已知限制

1. **生成时间**: 视频生成需要 3-5 分钟
2. **视频有效期**: 生成的视频 30 天后会被清理
3. **速率限制**: API 有调用频率限制
4. **区域限制**: 需使用北京区域端点

## 下一步建议

1. ✅ 集成到主 Agent 系统
2. ✅ 添加批量处理功能
3. ⏳ 添加视频预览功能
4. ⏳ 支持更多高级参数(相机控制,运动笔刷等)
5. ⏳ 添加视频质量评估

## 相关文件

- 核心实现: [src/master_clash/tools/kling.py](src/master_clash/tools/kling.py)
- 工具封装: [src/master_clash/tools/kling_video.py](src/master_clash/tools/kling_video.py)
- 完整文档: [docs/kling_video_guide.md](docs/kling_video_guide.md)
- 示例代码: [examples/kling_video_example.py](examples/kling_video_example.py)

## 参考资料

- Kling AI 官方文档: https://app.klingai.com/cn/dev/document-api
- JWT 认证标准: https://jwt.io
- LangChain Tools: https://python.langchain.com/docs/modules/agents/tools/
