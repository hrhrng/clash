/**
 * Timeline Design System
 * 统一的样式常量和设计 token
 */

export const colors = {
  // 背景层次（增强深度感）
  bg: {
    primary: '#1a1a1a',     // 主背景（更深）
    secondary: '#232323',   // 次级背景
    elevated: '#2a2a2a',    // 悬浮元素
    hover: '#2f2f2f',       // 悬停状态
    selected: '#2d2d3a',    // 选中状态背景（带蓝色调）
  },

  // 强调色（降低饱和度，更专业）
  accent: {
    primary: '#4A9EFF',     // 主色（蓝色）
    success: '#52C41A',     // 成功（绿色）
    warning: '#FAAD14',     // 警告（橙色）
    danger: '#F5222D',      // 危险（红色）
  },

  // 素材类型色（统一饱和度）
  item: {
    video: '#4A9EFF',       // 蓝
    audio: '#FA8C16',       // 橙
    image: '#9254DE',       // 紫
    text: '#52C41A',        // 绿
    solid: '#8C8C8C',       // 灰
  },

  // 文字层次
  text: {
    primary: '#FFFFFF',
    secondary: '#A6A6A6',
    tertiary: '#666666',
    disabled: '#404040',
  },

  // 边框
  border: {
    default: '#3a3a3a',
    active: '#4A9EFF',
    hover: '#505050',
  },

  // 辅助线和指示器
  guide: {
    snap: '#FAAD14',        // 吸附辅助线（黄色）
    insert: '#4A9EFF',      // 插入指示线（蓝色）
  }
} as const;

export const spacing = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 24,
} as const;

export const borderRadius = {
  sm: 2,
  md: 4,
  lg: 6,
  full: 9999,
} as const;

export const zIndex = {
  base: 1,
  ruler: 10,
  playhead: 20,
  dragging: 30,
  tooltip: 40,
  modal: 50,
} as const;

export const typography = {
  fontFamily: {
    sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    mono: '"SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, monospace',
  },
  fontSize: {
    xs: 11,
    sm: 12,
    md: 13,
    lg: 14,
    xl: 16,
  },
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
} as const;

export const timeline = {
  // 布局尺寸
  headerHeight: 48,
  rulerHeight: 32,
  trackHeight: 72,
  trackLabelWidth: 180,

  // 素材项
  itemMinWidth: 30,        // 最小宽度（对应 15 帧 * 2px）
  itemVerticalPadding: 6,  // 上下间距
  itemBorderRadius: 4,

  // 播放头
  playheadWidth: 2,
  playheadTriangleSize: 12,

  // 缩放
  zoomMin: 0.25,
  zoomMax: 5,
  zoomDefault: 1,

  // 吸附
  snapThreshold: 5,         // 吸附阈值（帧数）
  snapGridInterval: 5,      // 网格间隔（帧数）

  // 调整大小
  resizeHandleWidth: 8,    // 边缘可拖拽区域宽度

  // 滚动
  scrollbarThickness: 12,
} as const;

export const shadows = {
  sm: '0 1px 2px rgba(0, 0, 0, 0.3)',
  md: '0 2px 4px rgba(0, 0, 0, 0.4)',
  lg: '0 4px 8px rgba(0, 0, 0, 0.5)',
  selected: '0 0 0 2px #4A9EFF, 0 4px 12px rgba(74, 158, 255, 0.3)',
  hover: '0 2px 8px rgba(0, 0, 0, 0.4)',
} as const;

export const transitions = {
  fast: 'all 0.15s ease',
  normal: 'all 0.2s ease',
  slow: 'all 0.3s ease',
} as const;

// 动画配置（用于 framer-motion）
export const animations = {
  spring: {
    type: 'spring' as const,
    stiffness: 300,
    damping: 30,
  },
  springGentle: {
    type: 'spring' as const,
    stiffness: 200,
    damping: 25,
  },
  tween: {
    type: 'tween' as const,
    duration: 0.2,
  },
} as const;

// 辅助函数：根据素材类型获取颜色
export function getItemColor(type: 'video' | 'audio' | 'image' | 'text' | 'solid', customColor?: string): string {
  if (type === 'solid' && customColor) {
    return customColor;
  }
  return colors.item[type];
}

// 辅助函数：生成带透明度的颜色
export function withOpacity(color: string, opacity: number): string {
  // 简单的 hex 转 rgba（假设输入是 #RRGGBB 格式）
  const hex = color.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}
