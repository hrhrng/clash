# 故障排除指南

## 常见问题

### 1. `AttributeError: 'NoneType' object has no attribute 'step_1_concept'`

**原因**: 模型返回了 None,可能是:
- ❌ API 密钥无效或过期
- ❌ 模型名称不存在
- ❌ API 配额用完
- ❌ 网络连接问题

**解决方案**:

#### 步骤 1: 检查 API 密钥
```python
from config import GEMINI_API_KEY, GOOGLE_API_KEY
print(f"GEMINI_API_KEY: {GEMINI_API_KEY[:20]}...")
print(f"GOOGLE_API_KEY: {GOOGLE_API_KEY[:20]}...")
```

#### 步骤 2: 验证模型名称
当前配置的模型:
- TEXT_MODEL_NAME: `gemini-2.0-flash-exp`
- IMAGE_MODEL_NAME: `gemini-2.0-flash-exp`

可用的 Gemini 模型:
- `gemini-2.0-flash-exp` (推荐 - 最新)
- `gemini-1.5-pro` (稳定)
- `gemini-1.5-flash` (快速)

修改 `config.py` 中的模型名称:
```python
TEXT_MODEL_NAME = "gemini-1.5-pro"  # 使用稳定版本
```

#### 步骤 3: 测试 API 连接
```python
from google import genai
from config import GEMINI_API_KEY

client = genai.Client(api_key=GEMINI_API_KEY)

# 简单测试
try:
    response = client.models.generate_content(
        model="gemini-1.5-flash",
        contents="Say hello"
    )
    print("✅ API 工作正常:", response.text)
except Exception as e:
    print("❌ API 错误:", e)
```

#### 步骤 4: 检查配额
访问 Google AI Studio: https://aistudio.google.com/app/apikey
查看你的 API 配额使用情况

### 2. 图像生成失败

**症状**:
- `generate_image()` 返回空结果
- 超时错误

**解决方案**:

#### 使用 Nano Banana Pro 替代
```python
from image_generation import generate_image_nano

result = generate_image_nano(
    prompt="你的 prompt",
    filename="test",
    aspect_ratio="1:1",
    resolution="1K"
)
```

#### 检查 Gemini 图像生成可用性
```python
from google import genai
from google.genai import types
from config import GEMINI_API_KEY, IMAGE_MODEL_NAME

client = genai.Client(api_key=GEMINI_API_KEY)

# 测试图像生成
try:
    response = client.models.generate_content(
        model=IMAGE_MODEL_NAME,
        contents=[types.Part.from_text("A red apple")],
        config=types.GenerateContentConfig(
            response_modalities=["IMAGE"]
        )
    )
    print("✅ 图像生成可用")
except Exception as e:
    print("❌ 图像生成不可用:", e)
```

### 3. 模块导入错误

**症状**: `ModuleNotFoundError` 或 `ImportError`

**解决方案**:

#### 检查 Python 路径
```python
import sys
print("Python path:", sys.path)
print("Current directory:", os.getcwd())
```

#### 确保在项目根目录
```bash
cd /Users/xiaoyang/Proj/master-clash
python -c "from agents import generate_script; print('✅ Import OK')"
```

#### 在 Jupyter Notebook 中
```python
import sys
sys.path.insert(0, '/Users/xiaoyang/Proj/master-clash')
```

### 4. LangChain 版本问题

**症状**:
- `with_structured_output` 不存在
- 类型不兼容

**解决方案**:

#### 检查版本
```bash
pip list | grep langchain
```

需要的版本:
- `langchain-google-genai >= 2.0.0`
- `langchain-core >= 0.3.0`

#### 更新包
```bash
pip install --upgrade langchain-google-genai langchain-core
# 或使用 uv
uv pip install --upgrade langchain-google-genai langchain-core
```

### 5. Pydantic 验证错误

**症状**: `ValidationError` 当解析模型输出时

**解决方案**:

#### 临时禁用严格验证
在 `models.py` 中添加:
```python
from pydantic import ConfigDict

class ScriptOutput(BaseModel):
    model_config = ConfigDict(extra='allow')  # 允许额外字段
    # ...
```

#### 查看原始输出
```python
# 在 script_agent.py 中调试
print("Raw response:", script_result)
print("Type:", type(script_result))
```

## 快速诊断脚本

创建 `diagnose.py`:
```python
#!/usr/bin/env python3
"""快速诊断脚本"""

print("="*60)
print("AI Video Production System - 诊断")
print("="*60)

# 1. 检查导入
print("\n1. 检查模块导入...")
try:
    from config import TEXT_MODEL_NAME, IMAGE_MODEL_NAME, GEMINI_API_KEY
    from models import ScriptOutput
    from agents import generate_script
    print("✅ 所有模块导入成功")
except Exception as e:
    print(f"❌ 导入失败: {e}")
    exit(1)

# 2. 检查配置
print("\n2. 检查配置...")
print(f"   TEXT_MODEL: {TEXT_MODEL_NAME}")
print(f"   IMAGE_MODEL: {IMAGE_MODEL_NAME}")
print(f"   API_KEY: {GEMINI_API_KEY[:20]}...{GEMINI_API_KEY[-10:]}")

# 3. 测试 API
print("\n3. 测试 Google AI API...")
try:
    from google import genai
    client = genai.Client(api_key=GEMINI_API_KEY)
    response = client.models.generate_content(
        model="gemini-1.5-flash",
        contents="Say hello in one word"
    )
    print(f"✅ API 工作正常: {response.text}")
except Exception as e:
    print(f"❌ API 测试失败: {e}")

# 4. 测试脚本生成
print("\n4. 测试脚本生成...")
try:
    result = generate_script("A robot finds a flower")
    print("✅ 脚本生成成功!")
except Exception as e:
    print(f"❌ 脚本生成失败: {e}")

print("\n" + "="*60)
print("诊断完成")
print("="*60)
```

运行:
```bash
python diagnose.py
```

## 获取帮助

如果以上方法都无法解决问题:

1. 查看完整错误堆栈
2. 检查 `config.py` 中的所有配置
3. 尝试使用不同的模型名称
4. 创建最小可复现示例
5. 查看 Google AI Studio 控制台的错误日志
