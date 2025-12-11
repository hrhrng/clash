# InteractiveCanvas - 可交互的视频画布

## 概述

`InteractiveCanvas` 是一个可以在画布上直接拖拽、缩放、旋转 item 的交互式预览组件。

### 核心特性

✅ **基于 Remotion Player** - 底层使用 Remotion Player，保持逐帧渲染的特性
✅ **实时可视化编辑** - 直接在画布上拖拽 item，实时更新 properties
✅ **完整的变换控制** - 支持移动、缩放、旋转
✅ **选择框和控制点** - 类似 Figma/Canva 的交互体验

## 使用方法

```tsx
import { InteractiveCanvas } from '@remotion-fast/ui';

<InteractiveCanvas
  tracks={tracks}
  selectedItemId={selectedItemId}
  currentFrame={currentFrame}
  compositionWidth={1920}
  compositionHeight={1080}
  fps={30}
  durationInFrames={300}
  onUpdateItem={(trackId, itemId, updates) => {
    // 更新 item properties
    dispatch({
      type: 'UPDATE_ITEM',
      payload: { trackId, itemId, updates },
    });
  }}
  playing={false}
/>
```

## API

### Props

| 属性 | 类型 | 说明 |
|-----|------|------|
| `tracks` | `Track[]` | 轨道数组 |
| `selectedItemId` | `string \| null` | 当前选中的 item ID |
| `currentFrame` | `number` | 当前帧 |
| `compositionWidth` | `number` | 画布宽度 |
| `compositionHeight` | `number` | 画布高度 |
| `fps` | `number` | 帧率 |
| `durationInFrames` | `number` | 总帧数 |
| `onUpdateItem` | `(trackId, itemId, updates) => void` | 更新 item 的回调 |
| `playing` | `boolean` | 是否播放中 |
| `onSeek` | `(frame: number) => void` | 可选：跳转帧的回调 |

## 交互功能

### 1. 移动 (Move)
- **操作**：拖拽选择框
- **更新属性**：`x`, `y`
- **坐标系**：以画布中心为原点，单位为像素

### 2. 缩放 (Scale)
- **操作**：拖拽四个角的控制点
- **更新属性**：`width`, `height`
- **范围**：0.1 - 无限大

### 3. 旋转 (Rotate)
- **操作**：拖拽顶部旋转手柄
- **更新属性**：`rotation`
- **单位**：度数（degrees）

## 工作原理

```
┌────────────────────────────────┐
│   SVG Overlay (交互层)          │
│   - 选择框                      │
│   - 缩放手柄 (4个角)            │
│   - 旋转手柄 (顶部)             │
│   - 鼠标事件处理                │
└────────────────────────────────┘
              ↓
┌────────────────────────────────┐
│   Remotion Player (渲染层)     │
│   - VideoComposition           │
│   - 逐帧渲染所有 items         │
│   - 应用 Transform properties  │
└────────────────────────────────┘
```

### 坐标转换

1. **屏幕坐标** → **Composition 坐标**
   ```typescript
   const scaleX = compositionWidth / screenWidth;
   const scaleY = compositionHeight / screenHeight;
   
   compX = screenX * scaleX;
   compY = screenY * scaleY;
   ```

2. **Composition 坐标** → **中心坐标系**
   ```typescript
   centerX = compX - compositionWidth / 2;
   centerY = compY - compositionHeight / 2;
   ```

## 性能优化

- ✅ 使用 `useCallback` 避免不必要的重新渲染
- ✅ 拖拽时直接更新 state，Remotion Player 自动重新渲染
- ✅ SVG overlay 层不影响 Player 的渲染性能

## 未来改进

- [ ] 支持多选和批量操作
- [ ] 添加辅助线和对齐功能
- [ ] 支持键盘快捷键（方向键微调位置）
- [ ] 添加缩放比例显示
- [ ] 支持锁定宽高比
- [ ] 添加撤销/重做历史

## 示例

查看 `CanvasPreview.tsx` 了解如何在实际项目中使用 InteractiveCanvas。
