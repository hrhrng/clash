# Google AI Studio Proxy via Vercel

## 概述

由于本地环境可能无法直接访问 Google AI Studio API,我们通过 Vercel 部署的 API Route 作为代理层来转发请求。

## 架构

```
Client/Browser → Vercel API Route (/api/google-ai) → Google AI Studio API
```

## 配置

### 1. 环境变量设置

在 `.env` 文件中添加你的 Google API Key:

```bash
GOOGLE_API_KEY=your_actual_google_api_key_here
```

### 2. Vercel 部署配置

如果部署到 Vercel,在项目设置中添加环境变量:

1. 进入 Vercel Dashboard
2. 选择你的项目
3. Settings → Environment Variables
4. 添加 `GOOGLE_API_KEY`

## 使用方法

### 方式一: 使用 GoogleAIGC 类 (推荐)

在客户端代码中使用代理模式:

```typescript
import { GoogleAIGC } from '@/app/agent/aigc';

// 创建实例时传入 useProxy: true
const aigc = new GoogleAIGC(true);

// 生成图片
const imageResult = await aigc.generateImage('a beautiful sunset over mountains');
console.log(imageResult.text);
console.log(imageResult.commands);

// 生成视频
const videoResult = await aigc.generateVideo('a robot walking in a futuristic city');
console.log(videoResult.text);
console.log(videoResult.commands);
```

### 方式二: 直接调用 API 端点

你也可以直接使用 fetch 调用代理端点:

```typescript
const response = await fetch('/api/google-ai', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({
        model: 'nano-banana-pro-001', // 或其他支持的模型
        messages: [
            {
                role: 'user',
                content: 'Generate an image of a sunset'
            }
        ],
        temperature: 0.7,
        maxTokens: 2048
    }),
});

const data = await response.json();
console.log(data.text); // AI 生成的文本
console.log(data.rawResponse); // 完整的 Google AI 响应
```

## 支持的模型

- `nano-banana-pro-001` - 图片生成模型
- `veo-3.1-preview-001` - 视频生成模型
- `gemini-3.0-pro-preview-001` - 文本生成模型 (作为 fallback)
- `gemini-2.0-flash-exp` - 通用文本模型

## API 端点详情

### POST /api/google-ai

**请求体:**

```typescript
{
    model: string;          // 必需: Google AI 模型名称
    messages: Array<{       // 必需: 消息数组
        role: string;       // 'user' 或 'system'
        content: string;    // 消息内容
    }>;
    temperature?: number;   // 可选: 0-1, 默认 0.7
    maxTokens?: number;     // 可选: 最大 token 数, 默认 2048
}
```

**响应:**

```typescript
{
    success: boolean;
    text: string;           // AI 生成的文本
    rawResponse: object;    // Google AI 原始响应
}
```

**错误响应:**

```typescript
{
    error: string;
    message?: string;
    details?: string;
}
```

### GET /api/google-ai

健康检查端点,返回服务状态。

## 注意事项

1. **API Key 安全**: API Key 只存储在服务器端环境变量中,不会暴露给客户端
2. **Fallback 机制**: 当 nano-banana 或 veo-3 不可用时,会自动降级到 gemini-3
3. **本地开发**: 本地开发时确保 `.env` 文件包含 `GOOGLE_API_KEY`
4. **生产部署**: Vercel 部署时在环境变量中配置 API Key

## 故障排查

### 错误: "GOOGLE_API_KEY not found"

检查 `.env` 文件或 Vercel 环境变量是否正确配置。

### 错误: "Google AI API request failed"

可能原因:
- API Key 无效或过期
- 模型名称错误
- 网络连接问题
- Google AI Studio 服务暂时不可用

查看服务器日志获取详细错误信息。

### 本地无法访问 Google AI

这正是我们使用 Vercel 代理的原因。确保:
1. 已部署到 Vercel
2. 使用 `useProxy: true` 模式
3. 环境变量已在 Vercel 配置

## 示例代码

完整的 React 组件示例:

```typescript
'use client';

import { useState } from 'react';
import { GoogleAIGC } from '@/app/agent/aigc';

export default function ImageGenerator() {
    const [prompt, setPrompt] = useState('');
    const [result, setResult] = useState('');
    const [loading, setLoading] = useState(false);

    const handleGenerate = async () => {
        setLoading(true);
        try {
            const aigc = new GoogleAIGC(true); // 使用代理模式
            const response = await aigc.generateImage(prompt);
            setResult(response.text);
        } catch (error) {
            console.error('Generation failed:', error);
            setResult('生成失败,请重试');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-4">
            <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="输入图片描述..."
                className="w-full p-2 border rounded"
            />
            <button
                onClick={handleGenerate}
                disabled={loading}
                className="mt-2 px-4 py-2 bg-red-500 text-white rounded"
            >
                {loading ? '生成中...' : '生成图片'}
            </button>
            {result && (
                <div className="mt-4 p-4 bg-gray-50 rounded">
                    {result}
                </div>
            )}
        </div>
    );
}
```

## 性能优化建议

1. **缓存**: 考虑缓存常见请求的响应
2. **速率限制**: 添加速率限制防止滥用
3. **超时设置**: 为长时间运行的请求设置合理的超时时间
4. **错误重试**: 实现智能重试机制

## 相关文件

- [app/api/google-ai/route.ts](../app/api/google-ai/route.ts) - API 代理路由
- [app/agent/aigc.ts](../app/agent/aigc.ts) - AIGC 客户端类
- [.env.example](../.env.example) - 环境变量示例
