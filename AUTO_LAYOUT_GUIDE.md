# 自动布局系统 (Auto Layout System)

## 概述

实现了一个智能的节点自动布局系统，具备以下核心功能：

1. **自动碰撞检测** - 使用 React Flow 原生 API 检测节点重叠
2. **Group 自动扩展** - 当节点放入 group 时，group 会自动扩大以容纳新节点
3. **Group 挤压逻辑** - 当 group 扩展时与其他 group 重叠，会自动推开其他 group
4. **智能节点放置** - 新节点会自动放置在父节点同一 group 中，避免重叠

## 架构设计

### 核心模块

#### 1. `app/utils/layout.ts`
布局工具函数库，提供：
- `getNodeSize()` - 获取不同类型节点的默认尺寸
- `rectOverlaps()` - 检测矩形是否重叠
- `getAbsolutePosition()` - 计算节点的绝对坐标（考虑父节点层级）
- `getAbsoluteRect()` - 获取节点的绝对矩形区域
- `findNonOverlappingPosition()` - 螺旋搜索算法，找到不重叠的位置
- `calculateGroupBounds()` - 计算 group 需要的最小尺寸
- `expandGroupToFit()` - 扩展 group 以容纳新节点
- `resolveGroupOverlaps()` - 解决 group 之间的重叠（挤压逻辑）
- `autoPlaceNode()` - 自动放置节点（综合功能）

#### 2. `app/hooks/useAutoLayout.ts`
React Hook，提供高级布局管理功能：
- `addNodeWithAutoLayout()` - 添加节点，自动处理碰撞检测和 group 扩展
- `expandGroupForNode()` - 为节点扩展其所在的 group
- `addNodeToGroup()` - 将节点添加到指定 group（用于 Agent/API 调用）

**关键特性**：
- 使用 React Flow 的 `getIntersectingNodes()` API 进行碰撞检测
- 自动处理父子坐标系转换
- 支持 group 嵌套

## 使用方式

### 1. 在组件中使用（推荐）

```typescript
import { useAutoLayout } from '@/app/hooks/useAutoLayout';

function MyComponent({ id }: NodeProps) {
    const { addNodeWithAutoLayout } = useAutoLayout();

    const handleGenerateImage = async () => {
        // 创建资源...
        const asset = await createAsset({ ... });

        // 使用自动布局添加新节点
        const newNode = addNodeWithAutoLayout(
            {
                id: asset.id,
                type: 'image',
                data: {
                    label: 'Generated Image',
                    src: asset.url,
                },
            },
            id // 当前节点 ID（作为参考点）
        );

        if (!newNode) {
            console.error('Failed to add node');
            return;
        }

        // 继续其他操作...
    };
}
```

### 2. 通过 API/Agent 添加节点到 Group

```typescript
import { useAutoLayout } from '@/app/hooks/useAutoLayout';

function MyAgent() {
    const { addNodeToGroup } = useAutoLayout();

    // 将节点添加到指定 group
    const newNode = addNodeToGroup(
        {
            type: 'text',
            data: { content: 'Hello' },
        },
        'group-123' // Group ID
    );
}
```

## 工作流程

### 场景1：Action Badge 生成图片

```
1. 用户点击 Action Badge 的 Execute 按钮
   ↓
2. 调用 addNodeWithAutoLayout()
   ↓
3. 检测 Action Badge 是否在 group 中
   ↓
4. 使用 React Flow 的 getIntersectingNodes 检测碰撞
   ↓
5. 螺旋搜索找到不重叠的位置
   ↓
6. 将新节点放置在同一 group 中（如果有）
   ↓
7. 检查 group 是否需要扩展
   ↓
8. 如果需要，扩展 group 并检查与其他 group 的重叠
   ↓
9. 使用挤压逻辑推开重叠的 group
```

### 场景2：Agent 通过 API 添加节点

```
1. Agent 调用 ADD_NODE 命令，指定 parentId (group ID)
   ↓
2. 调用 addNodeToGroup(node, groupId)
   ↓
3. 在 group 内找到不重叠的位置
   ↓
4. 添加节点（相对于 group 的坐标）
   ↓
5. 自动扩展 group（如果需要）
   ↓
6. 解决 group 重叠
```

## 关键算法

### 螺旋搜索算法（Spiral Search）

```typescript
// 从目标位置开始，以螺旋方式搜索不重叠的位置
for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const angle = (attempt * Math.PI * 2) / 8; // 8个方向
    const distance = Math.floor(attempt / 8) * offsetStep; // 每圈增加距离
    const x = targetPos.x + Math.cos(angle) * distance;
    const y = targetPos.y + Math.sin(angle) * distance;

    // 使用 React Flow 检测碰撞
    if (!hasCollision(x, y)) {
        return { x, y };
    }
}
```

### Group 挤压算法（Group Squeeze）

```typescript
// 1. 找到所有与扩展后的 group 重叠的其他 group
// 2. 计算推开方向（从扩展 group 的中心指向重叠 group 的中心）
// 3. 根据方向推开重叠的 group
// 4. 递归检查被推开的 group 是否又与其他 group 重叠
```

## 配置参数

### 默认节点尺寸
```typescript
{
    group: { width: 400, height: 400 },
    text: { width: 300, height: 200 },
    image: { width: 300, height: 300 },
    video: { width: 300, height: 300 },
    audio: { width: 300, height: 100 },
    'action-badge': { width: 200, height: 80 },
}
```

### 搜索参数
- `maxAttempts`: 50（最大尝试次数）
- `offsetStep`: 50（每次偏移距离）
- `padding`: 50（group 内边距）

## 已实现的功能

✅ Group 自动扩展
✅ 使用 React Flow 原生碰撞检测
✅ 螺旋搜索找不重叠位置
✅ Group 挤压逻辑
✅ 父子节点坐标系转换
✅ Action Badge 生成节点时自动布局
✅ 支持嵌套 group

## 未来改进

- [ ] 添加动画效果（group 扩展、节点移动）
- [ ] 支持用户自定义布局算法
- [ ] 添加"撤销"功能
- [ ] 性能优化（大量节点时）
- [ ] 添加布局预览功能

## 注意事项

1. **坐标系统**：React Flow 使用相对坐标系统，子节点的坐标相对于父节点
2. **碰撞检测**：使用 React Flow 的 `getIntersectingNodes` API，比手动计算更可靠
3. **Group 嵌套**：支持 group 嵌套，但需要注意 z-index 的处理
4. **性能**：螺旋搜索算法在节点很多时可能较慢，可考虑优化

## 示例

查看 `frontend/app/components/nodes/ActionBadge.tsx` 中的实际使用示例。
