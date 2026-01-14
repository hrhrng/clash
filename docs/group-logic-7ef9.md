# Group 逻辑（基于 commit `7ef9b5ddc4dcf2690f8ffb6b643bb1446d6de26e`）

本文总结 `7ef9...` 版本里「Group/子节点/子 Group/Resize」的业务规则与实现要点，方便后续迁移或重写时对齐行为。

对应实现位置（`7ef9`）：
- `frontend/app/components/ProjectEditor.tsx`
- `frontend/app/components/nodes/GroupNode.tsx`
- `frontend/app/utils/layout.ts`

## 1. 数据模型与坐标系

### 1.1 归属关系（ownership）
- **使用 `parentId` 表示节点归属的 group**。
- **当节点有 `parentId` 时**，`node.position` 是**相对 parent（group）左上角**的坐标。
- **当节点没有 `parentId` 时**，`node.position` 是画布的**绝对坐标**。

### 1.2 绝对坐标计算
在需要判断“是否落入 group”或做碰撞/包含判断时，必须将节点与 group 都转换到同一坐标系（绝对坐标）。

`7ef9` 的做法（概念上）：
- `getAbsolutePosition(node, nodes)`：递归加上所有祖先 group 的 position，得到绝对位置
- `getAbsoluteRect(node, nodes)`：绝对位置 + width/height（或默认值）得到绝对矩形

对应工具函数：`frontend/app/utils/layout.ts`

## 2. 拖拽加入/离开 Group（子节点移动）

### 2.1 触发点
- 逻辑挂在 `ReactFlow` 的 `onNodeDragStop`（拖拽结束时判定归属）。
- 目的：**拖拽结束后**，决定节点是否应该加入某个 group，或从 group 中脱离回到 root。

对应实现：`frontend/app/components/ProjectEditor.tsx`（`onNodeDragStop` 内）

### 2.2 判定规则（Node center in Group）
核心规则：
1. 取被拖拽节点的**绝对矩形** `absoluteNodeRect`
2. 用节点矩形的**中心点** `(centerX, centerY)` 判断是否在 group 内
3. 候选 group 为所有 `type === 'group' && id !== node.id` 的节点
4. 如果多个 group 同时包含中心点，选择 **z-index 最大**的 group（视作最“内层/最上层”）

注意：这里是“center-in-group”，不是“overlap”或“完全包含”。

### 2.3 防止循环嵌套（Circular nesting）
- 规则：**禁止把一个节点（尤其是 group）放进自己的后代 group**。
- 实现：`isDescendant(groupId, nodeId)` 递归检查 `group.parentId` 链上是否能追溯到 `nodeId`。

对应实现：`frontend/app/components/ProjectEditor.tsx`（`isDescendant` helper）

### 2.4 更新归属与坐标换算
当 `newParentId !== oldParentId` 时更新节点：

**加入某个 group**
- `node.parentId = newParentId`
- 将 `absoluteNodeRect` 转回相对坐标：
  - `relativePos = absoluteNodeRect.xy - absoluteParentGroupPos.xy`
  - `node.position = relativePos`
- `node.extent = undefined`
  - 关键业务意图：不使用 `extent: 'parent'`，以允许用户未来把节点拖出 group 脱离。

**脱离 group（变成 root）**
- `node.parentId = undefined`
- `node.position = absoluteNodeRect.xy`（直接用绝对坐标）
- `node.extent = undefined`

## 3. Sub Group（Group 嵌套）

### 3.1 Sub group 的加入规则
子 group 的归属判定与普通节点相同（同样走 `onNodeDragStop` 的 center-in-group 判定 + 防循环）。

### 3.2 z-index 规则（可编辑性/可选中性）
`7ef9` 的目标是让“子 group 位于父 group 之上（更靠前）”，避免出现：
- 子 group 被父 group 盖住导致无法选中/Resize

在 `onNodeDragStop` 里，当拖拽的是 group 且加入了 parent group，会额外：
- `newNode.draggable = true`
- `newNode.selectable = true`
- `newNode.style.zIndex = parentZIndex + 1`
- `newNode.extent = undefined`

对应实现：`frontend/app/components/ProjectEditor.tsx`（`onNodeDragStop` 内的 group 分支）

> 同样的 zIndex “父+1” 思路也用于创建“嵌套 group”的场景（addNode 的 zIndex 计算）。

## 4. Resize：Group 自己 resize 与父 group 自动扩容

### 4.1 Group 自己的 resize UI
Group 节点渲染：`frontend/app/components/nodes/GroupNode.tsx`
- 只有在 `selected === true` 时才渲染四角 `NodeResizeControl`
  - `top-left`, `top-right`, `bottom-left`, `bottom-right`
- 因此**用户必须先选中 group** 才能 resize。

### 4.2 子节点 resize 触发父 group 递归扩容
`7ef9` 在 `handleNodesChange` 里监听 `NodeChange.type === 'dimensions'`：

当某个节点（child）发生尺寸变化且它有 `parentId`：
1. 将变化后的 `width/height` 临时写入 `updatedNodes`（避免 ReactFlow state 更新时序导致拿到旧尺寸）
2. 执行 `resizeParentRecursive(nodesList, childNode)`：
   - 找到 parent group
   - 枚举该 parent 下所有子节点（`n.parentId === parentId`）
   - 计算所有子节点相对坐标下的 `maxRight/maxBottom`
   - `requiredWidth = maxRight + padding`
   - `requiredHeight = maxBottom + padding`
   - 若 required 超过当前 group size，则扩大 group，并继续向上递归扩容祖先 group
3. group 的扩大同时写到：
   - `node.width/node.height`
   - `node.style.width/node.style.height`

padding：`60`（实现里写死）

对应实现：`frontend/app/components/ProjectEditor.tsx`（`handleNodesChange` 的 `resizeParentRecursive`）

### 4.3 新增节点时的父 group 扩容
创建节点时（`addNode` 内）也会做类似的 `resizeParentRecursive`：
- 新节点加入 `updatedNodes` 后，如果它有 `parentId`，会递归扩容 parent group，确保新节点不会“超出 group”。

对应实现：`frontend/app/components/ProjectEditor.tsx`（`addNode` 末尾的 `resizeParentRecursive`）

## 5.（可选）Group 的几何工具能力（layout utils）

`frontend/app/utils/layout.ts` 提供了若干与 group 有关的几何工具；其中部分在 `7ef9` 中属于“可用能力/未来扩展”，不一定全部被 `ProjectEditor` 直接调用：

- `calculateGroupBounds(groupId, nodes)`：计算 group 容纳所有 children 的最小 size（带 padding）
- `expandGroupToFit(group, childAbsoluteRect, nodes)`：给定某个 child 的绝对矩形，计算 group 需要扩大的 size
- `resolveGroupOverlaps(expandedGroupId, nodes)`：扩容后处理 group 之间的 overlap（推开重叠 group）
- `autoPlaceNode(parentNode, newNodeType, nodes, offset)`：
  - 基于 parent 的绝对位置做 offset
  - 再用 `findNonOverlappingPosition` 找不重叠的位置
  - 如果 parent 在 group 内，会把结果转换成相对 group 的 position，并返回 `parentId`

## 6. 关键约束与设计意图

- **允许节点从 group 中拖出**：避免 `extent: 'parent'`，否则 ReactFlow 会强制节点不出 parent 范围，导致无法“拖出即脱离”。
- **归属判定使用中心点**：比 overlap 更稳定，避免只擦边就误入组。
- **避免循环嵌套**：group 嵌套是允许的，但必须禁止把祖先塞进后代（树结构必须无环）。
- **resize 时只扩不缩**：`resizeParentRecursive` 只在 required 大于 current 时扩容，不做自动缩小（避免抖动/误缩）。

