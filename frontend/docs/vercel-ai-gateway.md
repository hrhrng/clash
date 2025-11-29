# Vercel AI Gateway for Google AI Studio

## 什么是 Vercel AI Gateway?

Vercel AI Gateway 是 Vercel AI SDK 提供的智能代理层,用于优化 AI API 调用。与简单的 API 代理相比,它提供了显著的性能和成本优势。

## AI Gateway vs 直接调用

### 直接调用的问题

```typescript
// ❌ 直接调用 Google AI API
const response = await fetch('https://generativelanguage.googleapis.com/...', {
    headers: { 'Authorization': `Bearer ${API_KEY}` }
});
```

**问题:**
- API Key 暴露风险(如果在客户端)
- 无缓存,重复请求浪费配额
- 网络延迟高
- 需要手动处理重试逻辑
- 无请求监控和分析

### 使用 AI Gateway 的优势

```typescript
// ✅ 通过 Vercel AI Gateway
const aigc = new GoogleAIGC();
const result = await aigc.generateImage('sunset');
```

**优势:**

1. **自动缓存** 🚀
   - 相同请求直接返回缓存结果
   - 减少 API 调用成本
   - 降低响应延迟(从秒级到毫秒级)

2. **边缘网络优化** 🌍
   - 通过 Vercel Edge Network 路由
   - 自动选择最近的节点
   - 全球加速访问

3. **智能重试** 🔄
   - 自动处理临时性错误
   - 指数退避策略
   - 无需手动重试逻辑

4. **请求分析** 📊
   - 自动记录所有请求
   - 成本追踪
   - 性能监控

5. **安全性** 🔒
   - API Key 只在服务器端
   - 客户端无法访问密钥
   - 自动速率限制

6. **统一接口** 🎯
   - 支持多个 AI 提供商(Google, OpenAI, Anthropic 等)
   - 一致的 API 设计
   - 轻松切换模型

## 架构对比

### 传统架构
```
浏览器 → Google AI API (直接)
```
- ❌ API Key 暴露
- ❌ 无缓存
- ❌ 高延迟

### AI Gateway 架构
```
浏览器 → Vercel Edge (缓存) → Google AI API
```
- ✅ API Key 安全
- ✅ 智能缓存
- ✅ 低延迟

## 配置步骤

### 1. 安装依赖

```bash
npm install ai @ai-sdk/google
```

### 2. 环境变量

在 `.env` 添加:

```bash
GOOGLE_API_KEY=your_google_api_key_here

# 可选: 自定义 AI Gateway URL
AI_GATEWAY_URL=https://your-custom-gateway.vercel.app
```

### 3. Vercel 部署配置

在 Vercel Dashboard 设置环境变量:
- `GOOGLE_API_KEY`: 你的 Google AI API Key
- `AI_GATEWAY_URL`: (可选)自定义网关地址

## 使用示例

### 基础用法

```typescript
import { GoogleAIGC } from '@/app/agent/aigc';

const aigc = new GoogleAIGC();

// 生成图片
const imageResult = await aigc.generateImage('a futuristic city at sunset');
console.log(imageResult.text);
console.log(imageResult.commands);

// 生成视频
const videoResult = await aigc.generateVideo('robot walking in park');
console.log(videoResult.text);
```

### 流式响应 (推荐)

流式响应提供更好的用户体验:

```typescript
const aigc = new GoogleAIGC();

// 实时显示生成过程
for await (const chunk of aigc.generateImageStream('beautiful landscape')) {
    console.log('Chunk:', chunk);
    // 实时更新 UI
}
```

### React 组件示例

```typescript
'use client';

import { useState } from 'react';
import { GoogleAIGC } from '@/app/agent/aigc';

export default function AIGenerator() {
    const [prompt, setPrompt] = useState('');
    const [result, setResult] = useState('');
    const [loading, setLoading] = useState(false);
    const [streamText, setStreamText] = useState('');

    // 非流式生成
    const handleGenerate = async () => {
        setLoading(true);
        try {
            const aigc = new GoogleAIGC();
            const response = await aigc.generateImage(prompt);
            setResult(response.text);
        } catch (error) {
            console.error('Generation failed:', error);
        } finally {
            setLoading(false);
        }
    };

    // 流式生成
    const handleGenerateStream = async () => {
        setLoading(true);
        setStreamText('');
        try {
            const aigc = new GoogleAIGC();
            for await (const chunk of aigc.generateImageStream(prompt)) {
                setStreamText(prev => prev + chunk);
            }
        } catch (error) {
            console.error('Generation failed:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-6">
            <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="描述你想生成的图片..."
                className="w-full p-3 border rounded-lg"
            />

            <div className="flex gap-4 mt-4">
                <button
                    onClick={handleGenerate}
                    disabled={loading}
                    className="px-6 py-3 bg-red-500 text-white rounded-lg"
                >
                    {loading ? '生成中...' : '生成图片'}
                </button>

                <button
                    onClick={handleGenerateStream}
                    disabled={loading}
                    className="px-6 py-3 bg-blue-500 text-white rounded-lg"
                >
                    流式生成
                </button>
            </div>

            {result && (
                <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                    <h3 className="font-bold mb-2">生成结果:</h3>
                    {result}
                </div>
            )}

            {streamText && (
                <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                    <h3 className="font-bold mb-2">实时生成:</h3>
                    {streamText}
                </div>
            )}
        </div>
    );
}
```

## API 参考

### GoogleAIGC 类

```typescript
class GoogleAIGC {
    // 生成图片
    async generateImage(
        prompt: string,
        stream?: boolean
    ): Promise<AIGCResponse>

    // 生成视频
    async generateVideo(
        prompt: string,
        stream?: boolean
    ): Promise<AIGCResponse>

    // 流式生成图片
    async *generateImageStream(
        prompt: string
    ): AsyncGenerator<string, AIGCResponse>
}
```

### API 端点: `/api/google-ai`

**POST 请求:**

```typescript
{
    model: 'nanoBanana' | 'veo3' | 'gemini3' | 'gemini2Flash',
    prompt: string,
    stream?: boolean,
    temperature?: number,  // 0-1, 默认 0.7
    maxTokens?: number,    // 默认 2048
}
```

**响应:**

```typescript
{
    success: boolean,
    text: string,
    usage: {
        promptTokens: number,
        completionTokens: number,
        totalTokens: number
    },
    finishReason: string
}
```

## 性能优化

### 缓存策略

AI Gateway 自动缓存相同的请求:

```typescript
// 第一次调用 - 命中 API (慢)
const result1 = await aigc.generateImage('sunset');

// 第二次相同调用 - 命中缓存 (快!)
const result2 = await aigc.generateImage('sunset');
```

### 流式响应

使用流式响应提升用户体验:

```typescript
// ✅ 推荐: 流式响应
for await (const chunk of aigc.generateImageStream(prompt)) {
    updateUI(chunk); // 实时更新
}

// ❌ 不推荐: 等待完整响应
const result = await aigc.generateImage(prompt);
updateUI(result.text); // 用户需等待完整生成
```

## 成本优化

### 1. 利用缓存

相同请求会自动使用缓存,节省 API 配额:

```typescript
// 这两个调用只计费一次
await aigc.generateImage('sunset');
await aigc.generateImage('sunset'); // 使用缓存
```

### 2. 合理设置参数

```typescript
// 降低 temperature 获得更一致的结果(更易缓存)
const response = await fetch('/api/google-ai', {
    body: JSON.stringify({
        model: 'gemini2Flash',
        prompt: 'your prompt',
        temperature: 0.3, // 降低随机性
    })
});
```

### 3. 使用更小的模型

```typescript
// ✅ 使用 gemini-2.0-flash 处理简单任务
const model = 'gemini2Flash';

// ❌ 不必要的使用大模型
const model = 'nanoBanana'; // 仅在需要图片生成时使用
```

## 监控和分析

### Vercel Analytics

在 Vercel Dashboard 查看:
- 请求数量和频率
- 平均响应时间
- 缓存命中率
- 错误率
- 成本统计

### 自定义日志

```typescript
// API 路由自动记录所有请求
console.log('AI Gateway request:', {
    model,
    prompt,
    timestamp: new Date()
});
```

## 故障排查

### 常见错误

1. **"Invalid or missing API key"**
   - 检查 `.env` 文件
   - 确认 Vercel 环境变量配置

2. **"API quota exceeded"**
   - 查看 Google AI Studio 配额
   - 考虑升级 API 计划

3. **"Model not found"**
   - 确认模型名称正确
   - 检查 [lib/ai-config.ts](../lib/ai-config.ts) 中的模型配置

### 调试技巧

```typescript
// 启用详细日志
const response = await fetch('/api/google-ai', {
    body: JSON.stringify({
        model: 'gemini2Flash',
        prompt: 'test',
    })
});

const data = await response.json();
console.log('Full response:', data);
```

## 最佳实践

1. **总是使用 AI Gateway**
   - 不要直接调用 Google AI API
   - 通过 `/api/google-ai` 路由调用

2. **优先使用流式响应**
   - 提供更好的用户体验
   - 看起来响应更快

3. **实现错误处理**
   - 捕获并处理所有错误
   - 提供友好的错误提示

4. **监控使用情况**
   - 定期检查 Vercel Analytics
   - 优化高频请求

## 相关资源

- [Vercel AI SDK 文档](https://sdk.vercel.ai/docs)
- [Google AI Studio](https://makersuite.google.com/)
- [lib/ai-config.ts](../lib/ai-config.ts) - AI 配置
- [app/api/google-ai/route.ts](../app/api/google-ai/route.ts) - API 路由
- [app/agent/aigc.ts](../app/agent/aigc.ts) - 客户端类
