# 项目结构

## 核心模块 (Core Modules)

### 配置与数据
- **config.py** - 配置管理 (API keys, model names, paths)
- **models.py** - Pydantic 数据模型 (ScriptOutput, Shot, Character, Location)
- **utils.py** - 工具函数 (file I/O, conversions)

### 功能模块
- **prompts.py** - 所有 Prompt 模板
  - `SCRIPT_GENERATION_SYSTEM_PROMPT`
  - `get_character_prompt()`
  - `get_location_prompt()`
  - `get_shot_prompt()`

- **image_generation.py** - 图像生成后端
  - `generate_image()` - Gemini 图像生成
  - `generate_image_nano()` - Nano Banana Pro 图像生成
  - Helper functions for API calls

### Agent 模块
- **script_agent.py** - 脚本生成 Agent
  - `generate_script(user_input)` → ScriptOutput

- **asset_agent.py** - 资产生成 Agent
  - `generate_assets(script)` → Dict[asset_id, asset_data]

- **shot_agent.py** - 镜头生成 Agent
  - `generate_shots(script, assets)` → List[shot_results]
  - `print_production_summary()` - 打印总结

- **agents.py** - 统一导出接口
  - 从各个 agent 模块导入并重新导出
  - 提供简洁的 import 接口

## 工作流文件

### 主要工作环境
- **video_production.ipynb** - 主 Jupyter Notebook
  - 交互式工作流
  - 完全控制每个步骤
  - 推荐使用方式

### 辅助文件
- **example_workflow.py** - 完整工作流示例
  - 可直接运行
  - 可复制到新 notebook

- **main.py** - 可选的命令行工具
  - 简单快速使用
  - 不推荐用于复杂场景

## 旧文件 (保留但不推荐使用)
- **video.ipynb** - 原始 notebook (包含旧代码)

## 文档
- **README.md** - 项目说明和使用指南
- **REFACTOR_SUMMARY.md** - 重构总结
- **PROJECT_STRUCTURE.md** - 本文件

## 数据目录
- **production_assets/** - 生成的图像
- **output/** - 脚本 JSON 和其他输出

## 模块依赖关系

```
video_production.ipynb
    ↓
agents.py (统一接口)
    ↓
├── script_agent.py
│   ├── config.py
│   ├── models.py
│   ├── utils.py
│   └── prompts.py
│
├── asset_agent.py
│   ├── models.py
│   ├── image_generation.py
│   ├── utils.py
│   └── prompts.py
│
└── shot_agent.py
    ├── models.py
    ├── image_generation.py
    └── prompts.py
```

## 使用建议

### 开发和实验
使用 `video_production.ipynb`:
```python
from agents import generate_script, generate_assets, generate_shots

script = generate_script("故事创意")
# 检查和修改 script
assets = generate_assets(script)
# 检查 assets
shots = generate_shots(script, assets)
```

### 快速测试
使用 `example_workflow.py` 或 `main.py`:
```bash
python example_workflow.py
# 或
python main.py "故事创意" --full
```

### 自定义工作流
直接导入需要的模块:
```python
from script_agent import generate_script
from asset_agent import generate_assets
from prompts import get_character_prompt
from image_generation import generate_image_nano
```

## 扩展指南

### 添加新的 Prompt
在 `prompts.py` 中添加新函数

### 添加新的图像生成后端
在 `image_generation.py` 中添加新函数

### 添加新的 Agent
1. 创建新的 `xxx_agent.py` 文件
2. 在 `agents.py` 中导入和导出
3. 在 notebook 中使用

### 修改数据模型
在 `models.py` 中修改 Pydantic 模型
