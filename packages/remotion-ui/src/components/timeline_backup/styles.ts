/**
 * Timeline Design System
 * 统一的样式常量和设计 token
 */

export const colors = {
  // 背景层次
  bg: {
    primary: '#f8f9fa',
    secondary: '#ffffff',
    elevated: '#ffffff',
    hover: '#f0f2f5',
    selected: '#e6f7ff',
  },

  // 强调色
  accent: {
    primary: '#3b82f6',
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444',
  },

  // 素材类型色
  item: {
    video: '#3b82f6',
    audio: '#f97316',
    image: '#8b5cf6',
    text: '#10b981',
    solid: '#6b7280',
  },

  // 文字层次
  text: {
    primary: '#1f2937',
    secondary: '#6b7280',
    tertiary: '#9ca3af',
    disabled: '#d1d5db',
  },

  // 边框
  border: {
    default: '#e5e7eb',
    active: '#3b82f6',
    hover: '#d1d5db',
  },

  // 辅助线和指示器
  guide: {
    snap: '#f59e0b',
    insert: '#3b82f6',
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
  itemMinWidth: 30,
  itemVerticalPadding: 6,
  itemBorderRadius: 4,

  // 播放头
  playheadWidth: 2,
  playheadTriangleSize: 12,

  // 缩放
  zoomMin: 0.25,
  zoomMax: 5,
  zoomDefault: 1,

  // 吸附
  snapThreshold: 5,
  snapGridInterval: 5,

  // 调整大小
  resizeHandleWidth: 8,

  // 滚动
  scrollbarThickness: 12,
} as const;

export const shadows = {
  sm: '0 1px 2px rgba(0, 0, 0, 0.05)',
  md: '0 2px 4px rgba(0, 0, 0, 0.1)',
  lg: '0 4px 8px rgba(0, 0, 0, 0.15)',
  selected: '0 0 0 2px #3b82f6, 0 4px 12px rgba(59, 130, 246, 0.3)',
  hover: '0 2px 8px rgba(0, 0, 0, 0.1)',
} as const;

export const transitions = {
  fast: 'all 0.15s ease',
  normal: 'all 0.2s ease',
  slow: 'all 0.3s ease',
} as const;

// 动画配置
export const animations = {
  spring: {
    type: 'spring' as const,
    stiffness: 300,
    damping: 30,
  },
  fade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },
} as const;

// Helper: 根据类型获取素材颜色
export function getItemColor(type: string, selected = false, opacity = 1): string {
  const baseColor = colors.item[type as keyof typeof colors.item] || colors.item.video;
  if (selected) {
    return withOpacity(baseColor, Math.min(1, opacity * 1.2));
  }
  return withOpacity(baseColor, opacity);
}

// Helper: 添加透明度
export function withOpacity(color: string, opacity: number): string {
  // 简单的16进制颜色透明度转换
  const alpha = Math.round(opacity * 255).toString(16).padStart(2, '0');
  return `${color}${alpha}`;
}
