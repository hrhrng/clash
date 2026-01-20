# 视频首帧优化方案

## 当前实现（已完成）

### 方案：使用视频首帧作为静态预览

**实现位置：**
- `apps/web/app/components/RecentProjects.tsx`
- `apps/web/app/projects/ProjectsClient.tsx`

**核心逻辑：**
```tsx
{asset.type === 'video' ? (
  <div className="relative h-full w-full bg-gray-100">
    <img
      src={`${asset.url}#t=0.1`}
      alt="Video thumbnail"
      className="h-full w-full object-cover"
    />
    {/* 播放图标覆盖层 */}
    <div className="play-indicator">...</div>
  </div>
) : (
  <img src={asset.url} alt="Asset" />
)}
```

**优势：**
- ✅ Dashboard 预览秒开（直接显示首帧图片）
- ✅ 无需额外API调用或存储
- ✅ 使用 `#t=0.1` fragment 让浏览器自动提取首帧
- ✅ 添加播放图标提示用户这是视频
- ✅ 只在用户点击进入项目后才加载完整视频

**浏览器支持：**
- Chrome/Edge: 完全支持
- Safari: 支持（可能需要视频在同域）
- Firefox: 部分支持

---

## Cloudflare 高级优化方案（可选）

### 方案1: Cloudflare Stream（推荐用于生产环境）

**服务介绍：**
Cloudflare Stream 是专业的视频流媒体服务，提供：
- 自动生成多种分辨率的缩略图
- 自适应比特率流式传输
- 全球CDN加速
- 视频转码和优化

**定价：**
- $5/1000分钟存储
- $1/1000分钟播放

**使用方法：**

1. **上传视频到 Stream:**
```typescript
// apps/loro-sync-server/src/routes/generate.ts
async function uploadToStream(videoBlob: Blob, projectId: string) {
  const formData = new FormData();
  formData.append('file', videoBlob);

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/stream`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STREAM_API_TOKEN}`,
      },
      body: formData,
    }
  );

  const result = await response.json();
  return result.result.uid; // Stream video ID
}
```

2. **获取缩略图:**
```typescript
// 自动生成的缩略图URL
const thumbnailUrl = `https://videodelivery.net/${videoId}/thumbnails/thumbnail.jpg?time=1s&height=270`;
```

3. **在 Dashboard 中使用:**
```tsx
<img
  src={`https://videodelivery.net/${videoId}/thumbnails/thumbnail.jpg?time=1s`}
  alt="Video thumbnail"
/>
```

**参考文档：**
- [Cloudflare Stream API](https://developers.cloudflare.com/stream/)
- [缩略图配置](https://developers.cloudflare.com/stream/viewing-videos/displaying-thumbnails/)

---

### 方案2: Cloudflare Media Transformations（2025新功能）

**服务介绍：**
Media Transformations 允许通过URL参数直接从视频提取帧、调整大小等，无需预处理。

**使用方法：**

1. **视频存储在 R2:**
```
https://your-domain.com/videos/project-123/output.mp4
```

2. **提取首帧（通过URL参数）:**
```
https://your-domain.com/cdn-cgi/media/videos/project-123/output.mp4?extract_frame=1s&width=640&format=jpeg
```

3. **实现（通过 Cloudflare Worker）:**
```typescript
// wrangler.toml
[transformations]
enabled = true

// 在 Worker 中自动应用
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 如果是视频缩略图请求
    if (url.pathname.includes('/thumbnails/')) {
      const videoPath = url.pathname.replace('/thumbnails/', '/videos/');
      return fetch(`${videoPath}?extract_frame=1s&width=640&format=jpeg`);
    }

    return fetch(request);
  }
}
```

**优势：**
- 无需预生成缩略图
- 动态调整尺寸
- 自动优化格式

**参考文档：**
- [Media Transformations 公告](https://blog.cloudflare.com/introducing-cloudflare-media-transformations)

---

### 方案3: 服务端预生成缩略图（最灵活）

**实现思路：**
在视频生成完成后，服务端自动提取首帧并上传到 R2。

**实现位置：**
```typescript
// apps/loro-sync-server/src/lib/executor/kling.ts

async poll(externalTaskId: string): Promise<ExecutionResult> {
  // ... 现有轮询逻辑 ...

  if (data.task_status === 'succeed') {
    const videoUrl = videos[0]?.url;

    // 下载视频并提取首帧
    const thumbnailBlob = await extractFirstFrame(videoUrl);

    // 上传缩略图到 R2
    const thumbnailKey = `projects/${projectId}/thumbnails/${taskId}.jpg`;
    await env.ASSETS.put(thumbnailKey, thumbnailBlob);

    return {
      completed: true,
      resultUrl: videoUrl,
      resultData: {
        duration: videos[0]?.duration,
        thumbnailUrl: `/assets/${thumbnailKey}`, // 添加缩略图URL
      },
    };
  }
}

// 首帧提取函数（使用 ffmpeg.wasm 或调用外部服务）
async function extractFirstFrame(videoUrl: string): Promise<Blob> {
  // 选项1: 调用 Python API
  const response = await fetch(`${PYTHON_API}/extract-frame`, {
    method: 'POST',
    body: JSON.stringify({ url: videoUrl, timestamp: 1.0 }),
  });
  return response.blob();

  // 选项2: 使用浏览器原生能力（在客户端）
  // 选项3: 调用 Cloudflare Images API 直接转换
}
```

**在 Node 中存储缩略图URL：**
```typescript
// apps/loro-sync-server/src/sync/NodeUpdater.ts
updateNodeData(doc, nodeId, {
  src: resultUrl,
  thumbnailUrl: thumbnailKey, // 新增字段
  status: 'completed',
});
```

**在 Dashboard 中使用：**
```tsx
<img
  src={asset.thumbnailUrl || `${asset.url}#t=0.1`}
  alt="Video thumbnail"
/>
```

---

## 推荐方案对比

| 方案 | 加载速度 | 实现复杂度 | 成本 | 适用场景 |
|------|---------|-----------|------|---------|
| 当前方案 (首帧fragment) | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 免费 | 开发/MVP阶段 |
| Cloudflare Stream | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | $$$ | 生产环境，大量视频 |
| Media Transformations | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | $$ | R2存储，中等规模 |
| 预生成缩略图 | ⭐⭐⭐⭐⭐ | ⭐⭐ | $ | 需要完全控制 |

**当前建议：**
1. **开发阶段：** 继续使用当前的 `#t=0.1` 方案（已实现）
2. **生产阶段：** 考虑 Media Transformations 或预生成缩略图
3. **大规模部署：** 使用 Cloudflare Stream

---

## 性能监控

**测量首帧加载时间：**
```typescript
// apps/web/app/components/RecentProjects.tsx
<img
  src={`${asset.url}#t=0.1`}
  onLoad={(e) => {
    const loadTime = performance.now();
    console.log(`[Thumbnail] Loaded in ${loadTime}ms`);
  }}
  onError={(e) => {
    console.error('[Thumbnail] Failed to load');
  }}
/>
```

---

## 参考资源

- [Cloudflare Stream Documentation](https://developers.cloudflare.com/stream/)
- [Media Transformations Announcement](https://blog.cloudflare.com/introducing-cloudflare-media-transformations)
- [HTML5 Video Fragment Identifiers](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/video#specifying_playback_range)
