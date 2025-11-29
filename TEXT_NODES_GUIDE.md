# 文本节点类型说明

## 概述

系统现在有两种文本节点类型，用于不同的场景：

## 1. Prompt 节点 (prompt)

### 用途
用于生成内容的提示词输入，可以连接到 Action Badge 节点。

### 特点
- ✅ **有 handle**：可以连接到 Action Badge（图片生成、视频生成等）
- 📏 **高度更小**：150px（用户不需要太关注 prompt 内容，只要知道有即可）
- 🎨 **紫蓝渐变背景**：`bg-gradient-to-br from-purple-50 to-blue-50`
- 🔗 **紫色 handle**：`bg-purple-500`
- 📝 **标题颜色**：紫色 (`text-purple-500`)

### 默认内容
```markdown
# Prompt
Enter your prompt here...
```

### 使用场景
```
[Prompt 节点] ---> [Action Badge: Gen Image] ---> [生成的图片]
     ↑
   用户输入提示词
```

---

## 2. Context 节点 (context)

### 用途
用于提供画布上下文和背景信息，帮助 Agent 理解任务。例如：人物小传、世界观设定、项目背景等。

### 特点
- ❌ **无 handle**：不能连接到其他节点，仅作为背景信息展示
- 📏 **正常高度**：400px（可以显示更多内容）
- 🎨 **暖色背景**：`bg-[#FFFBF0]`（温暖的米黄色）
- 🏷️ **标题颜色**：琥珀色 (`text-amber-600`)
- 📖 **内容丰富**：可以展示完整的背景信息

### 默认内容
```markdown
# Context
Add background information here...
```

### 使用场景
```
画布上的 Context 节点（独立存在）：

┌─────────────────────────┐
│  人物小传                 │
│                         │
│  姓名：张三               │
│  年龄：28岁              │
│  背景：资深设计师...       │
│                         │
└─────────────────────────┘

Agent 可以读取这些信息来理解任务背景
```

---

## 对比表

| 特性 | Prompt 节点 | Context 节点 |
|------|------------|-------------|
| 高度 | 150px | 400px |
| Handle | ✅ 有（右侧） | ❌ 无 |
| 背景色 | 紫蓝渐变 | 暖米黄色 |
| 标题颜色 | 紫色 | 琥珀色 |
| 主要用途 | 生成内容的提示词 | 背景信息和上下文 |
| 可连接性 | 可连接到 Action Badge | 不可连接 |
| 内容展示 | 较少（淡出效果） | 较多（完整展示） |

---

## 编辑行为

两种节点的编辑行为完全一致：

1. **双击节点**：打开全屏编辑器
2. **编辑器**：使用 Milkdown 富文本编辑器
3. **标题编辑**：
   - 节点上方可直接编辑标题
   - 编辑器内也可修改标题
4. **保存**：点击 Save 或编辑器外点击
5. **取消**：点击 X 或按 ESC

---

## 创建节点

### 在 UI 中创建

在 Project Editor 底部工具栏的 **Assets** 区域：

1. **Prompt 按钮**：创建 Prompt 节点
2. **Context 按钮**：创建 Context 节点

### 通过代码创建

```typescript
// 创建 Prompt 节点
addNode('prompt');

// 创建 Context 节点
addNode('context');
```

### 通过 Agent API 创建

```typescript
// Prompt 节点
{
    type: 'ADD_NODE',
    payload: {
        type: 'prompt',
        data: {
            label: 'Image Generation Prompt',
            content: 'A serene landscape with mountains...'
        }
    }
}

// Context 节点
{
    type: 'ADD_NODE',
    payload: {
        type: 'context',
        data: {
            label: 'Character Background',
            content: '# John Doe\n\nAge: 35\nOccupation: Detective...'
        }
    }
}
```

---

## 样式细节

### Prompt 节点
```css
背景: bg-gradient-to-br from-purple-50 to-blue-50
边框: ring-1 ring-purple-200 (未选中)
     ring-4 ring-purple-500 (选中)
Handle: bg-purple-500
淡出渐变: from-purple-50
```

### Context 节点
```css
背景: bg-[#FFFBF0]
边框: ring-1 ring-amber-200 (未选中)
     ring-4 ring-amber-500 (选中)
无 Handle
淡出渐变: from-[#FFFBF0]
```

---

## 使用示例

### 完整工作流

```
1. 创建 Context 节点
   ├─ 添加项目背景信息
   └─ Agent 读取理解任务

2. 创建 Prompt 节点
   ├─ 编写图片生成提示词
   └─ 连接到 Action Badge

3. Action Badge 执行
   ├─ 读取 Prompt 内容
   ├─ 参考 Context 信息（如果需要）
   └─ 生成图片/视频

4. 生成结果
   └─ 新的图片/视频节点自动添加到画布
```

---

## 迁移指南

### 从旧的 text 节点迁移

旧的 `text` 节点仍然保留，但建议：

- **如果是提示词** → 改用 `prompt` 节点
- **如果是背景信息** → 改用 `context` 节点
- **如果两者都不是** → 继续使用 `text` 节点

---

## 常见问题

### Q: 为什么 Context 节点没有 handle？
A: Context 节点是用于提供背景信息的，不需要参与数据流。Agent 可以通过读取画布上所有节点来获取 context 信息。

### Q: Prompt 节点为什么这么小？
A: 因为用户通常只需要知道 "有一个 prompt"，具体内容可以双击查看。小的节点可以让画布更整洁。

### Q: 可以把 Prompt 节点连接到 Context 节点吗？
A: 不可以，Context 节点没有 handle。但 Agent 可以同时读取两种节点的内容。

### Q: 能否自定义节点高度？
A: 目前是固定高度，但可以通过修改节点组件的 CSS 来调整。

---

## 技术实现

### 文件位置
- Prompt 节点：`frontend/app/components/nodes/PromptNode.tsx`
- Context 节点：`frontend/app/components/nodes/ContextNode.tsx`
- 注册位置：`frontend/app/components/ProjectEditor.tsx`
- 布局配置：`frontend/app/utils/layout.ts`

### 尺寸配置
```typescript
// in layout.ts
prompt: { width: 300, height: 150 }
context: { width: 300, height: 400 }
```
