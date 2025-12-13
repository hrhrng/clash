// Leica 风格配色方案
// 主体：白色和浅灰
// 过渡：中灰
// 细节：Leica 红

export const leicaTheme = {
  // 基础色
  colors: {
    // 白色系
    white: '#FFFFFF',
    offWhite: '#FAFAFA',
    lightGray: '#F5F5F5',
    
    // 灰色系（过渡）
    gray100: '#E8E8E8',
    gray200: '#D4D4D4',
    gray300: '#B8B8B8',
    gray400: '#9E9E9E',
    gray500: '#6B6B6B',
    
    // Leica 红（细节）
    leicaRed: '#E3000B',
    leicaRedHover: '#C50009',
    leicaRedLight: '#FF1A24',
    
    // 文字
    textPrimary: '#2A2A2A',
    textSecondary: '#6B6B6B',
    textTertiary: '#9E9E9E',
    textInverse: '#FFFFFF',
    
    // 边框
    border: '#E8E8E8',
    borderHover: '#D4D4D4',
    divider: '#F5F5F5',
  },
  
  // 阴影
  shadows: {
    sm: '0 1px 2px rgba(0, 0, 0, 0.04)',
    md: '0 2px 4px rgba(0, 0, 0, 0.06)',
    lg: '0 4px 8px rgba(0, 0, 0, 0.08)',
    xl: '0 8px 16px rgba(0, 0, 0, 0.1)',
  },
  
  // 圆角
  radius: {
    sm: '2px',
    md: '4px',
    lg: '6px',
  },
  
  // 字体
  fonts: {
    primary: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", "Segoe UI", sans-serif',
    mono: '"SF Mono", Monaco, "Cascadia Code", monospace',
  },
}

export type LeicaTheme = typeof leicaTheme
