#!/usr/bin/env python3
"""快速诊断脚本 - 检查系统配置和 API 连接"""

print("="*60)
print("AI Video Production System - 诊断")
print("="*60)

# 1. 检查导入
print("\n[1/5] 检查模块导入...")
try:
    from config import TEXT_MODEL_NAME, IMAGE_MODEL_NAME, GEMINI_API_KEY, GOOGLE_API_KEY
    from models import ScriptOutput
    from agents import generate_script
    print("✅ 所有模块导入成功")
except Exception as e:
    print(f"❌ 导入失败: {e}")
    import traceback
    traceback.print_exc()
    exit(1)

# 2. 检查配置
print("\n[2/5] 检查配置...")
print(f"   TEXT_MODEL: {TEXT_MODEL_NAME}")
print(f"   IMAGE_MODEL: {IMAGE_MODEL_NAME}")
if GEMINI_API_KEY:
    print(f"   GEMINI_API_KEY: {GEMINI_API_KEY[:20]}...{GEMINI_API_KEY[-10:]}")
else:
    print("   ❌ GEMINI_API_KEY 未设置!")
if GOOGLE_API_KEY:
    print(f"   GOOGLE_API_KEY: {GOOGLE_API_KEY[:20]}...{GOOGLE_API_KEY[-10:]}")
else:
    print("   ❌ GOOGLE_API_KEY 未设置!")

# 3. 测试基础 API
print("\n[3/5] 测试 Google AI API (基础)...")
try:
    from google import genai
    client = genai.Client(api_key=GEMINI_API_KEY)

    # 使用稳定的 flash 模型测试
    response = client.models.generate_content(
        model="gemini-1.5-flash",
        contents="Say hello in one word"
    )
    print(f"✅ API 工作正常: {response.text}")
except Exception as e:
    print(f"❌ API 测试失败: {e}")
    import traceback
    traceback.print_exc()

# 4. 测试 LangChain 集成
print(f"\n[4/5] 测试 LangChain + {TEXT_MODEL_NAME}...")
try:
    from langchain_google_genai import ChatGoogleGenerativeAI
    from langchain_core.messages import HumanMessage

    llm = ChatGoogleGenerativeAI(
        model=TEXT_MODEL_NAME,
        temperature=0.7,
        client=genai.Client(api_key=GEMINI_API_KEY)
    )

    response = llm.invoke([HumanMessage(content="Say hello in one word")])
    print(f"✅ LangChain 工作正常: {response.content}")
except Exception as e:
    print(f"❌ LangChain 测试失败: {e}")
    print(f"\n💡 建议: 尝试更换模型为 'gemini-1.5-pro' 或 'gemini-1.5-flash'")
    import traceback
    traceback.print_exc()

# 5. 测试结构化输出
print(f"\n[5/5] 测试结构化输出...")
try:
    from pydantic import BaseModel

    class TestOutput(BaseModel):
        greeting: str

    llm = ChatGoogleGenerativeAI(
        model=TEXT_MODEL_NAME,
        temperature=0.7,
        client=genai.Client(api_key=GEMINI_API_KEY)
    )

    structured_llm = llm.with_structured_output(TestOutput)
    result = structured_llm.invoke([HumanMessage(content="Say hello")])

    if result and hasattr(result, 'greeting'):
        print(f"✅ 结构化输出工作正常: {result.greeting}")
    else:
        print(f"❌ 结构化输出返回了意外结果: {type(result)}")
except Exception as e:
    print(f"❌ 结构化输出测试失败: {e}")
    import traceback
    traceback.print_exc()

print("\n" + "="*60)
print("诊断完成")
print("="*60)

print("\n📋 总结:")
print("   如果所有测试都通过,你的环境配置正确")
print("   如果有测试失败,请查看 TROUBLESHOOTING.md 获取解决方案")
print("\n💡 常见解决方案:")
print("   1. 更换模型: 在 config.py 中将 TEXT_MODEL_NAME 改为 'gemini-1.5-pro'")
print("   2. 检查 API Key: 确保 GOOGLE_API_KEY 或 GEMINI_API_KEY 已正确设置")
print("   3. 查看配额: 访问 https://aistudio.google.com/app/apikey")
