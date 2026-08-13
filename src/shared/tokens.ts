/**
 * dsh-desktop design tokens — single source of truth for main-process code.
 *
 * Mirrors dsh-desktop-design-spec.md §2 exactly. The renderer consumes the
 * same values as CSS custom properties (src/renderer/styles/tokens.css);
 * main-process code (window backgroundColor, title bar rendering) imports
 * these constants. Values are authoritative — do not restyle.
 */

/* ------------------------------------------------------------------ */
/* 2.1 / 2.2 — Colors (light / dark)                                   */
/* ------------------------------------------------------------------ */

export const colorsLight = {
  'bg-window': '#F4F6F9', // 窗口外壳底色 (冷调纸白)
  'bg-surface': '#FFFFFF', // 对话框、菜单、弹层表面
  'bg-hover': 'rgba(23,31,46,0.06)', // 悬停底色
  'text-primary': '#1A1D21', // 标题、正文
  'text-secondary': '#5F6672', // 描述、次要信息
  'text-tertiary': '#9AA1AC', // 脚注、禁用、未激活窗口
  hairline: '#E2E5EA', // 所有 1px 边框/分隔线
  accent: '#4D6BFE', // DeepSeek 品牌蓝 — 主按钮、焦点、运行态
  'accent-hover': '#3A57F0', // 主按钮悬停
  'accent-pressed': '#2E48D9', // 主按钮按下
  'accent-subtle': '#EEF1FF', // 图标底衬、选中态底色
  'accent-teal': '#12A5A1', // 次级品牌色 — 服务在线状态点
  error: '#E5484D', // 错误文案、错误边框
  'error-subtle': '#FDECEC', // 错误提示底色
  success: '#22A06B', // 校验通过 (极少量使用)
  'focus-ring': 'rgba(77,107,254,0.35)', // 输入框焦点环 (2px)
  'close-hover': '#E81123', // 关闭钮悬停底 (Windows 惯例, §3.1)
} as const;

export const colorsDark = {
  'bg-window': '#10131A', // 墨色外壳 (带蓝调,非纯黑)
  'bg-surface': '#191D26', // 对话框、菜单表面
  'bg-hover': 'rgba(255,255,255,0.07)', // 悬停底色
  'text-primary': '#E8EAED', // 标题、正文
  'text-secondary': '#9BA1AB', // 描述、次要信息
  'text-tertiary': '#5E6470', // 脚注、禁用、未激活窗口
  hairline: 'rgba(255,255,255,0.09)', // 1px 边框/分隔线
  accent: '#6C86FF', // 品牌蓝 (深色下提亮一档)
  'accent-hover': '#7E95FF', // 主按钮悬停
  'accent-pressed': '#5B74F0', // 主按钮按下
  'accent-subtle': 'rgba(108,134,255,0.14)', // 图标底衬
  'accent-teal': '#3CC9BE', // 服务在线状态点
  error: '#F2555A', // 错误文案、错误边框
  'error-subtle': 'rgba(242,85,90,0.12)', // 错误提示底色
  'focus-ring': 'rgba(108,134,255,0.50)', // 输入框焦点环
  'close-hover': '#D13438', // 关闭钮悬停底 (Windows 惯例, §3.1)
} as const;

export type ColorToken = keyof typeof colorsLight;

/**
 * Convenience lookup for the main process: `getColors(true).accent` etc.
 * 注意: `success` 令牌仅存在于浅色主题 (spec §2.1/§2.2), 深色下取值为 undefined,
 * 调用方需按可选成员处理。
 */
export function getColors(
  dark: boolean,
): Readonly<Partial<Record<ColorToken, string>>> {
  return dark ? colorsDark : colorsLight;
}

/* ------------------------------------------------------------------ */
/* 2.3 — Corner radius                                                 */
/* ------------------------------------------------------------------ */

export const radius = {
  window: 8, // 窗口外圆角 (DWM 原生处理)
  dialog: 12, // 引导对话框、设置弹层
  popover: 8, // 小浮层、菜单
  control: 6, // 按钮、输入框
  chip: 10, // 图标底衬 (40px 见方)
  pill: 999, // 状态徽章、提示 chip
} as const;

export const radiusPx = {
  window: '8px',
  dialog: '12px',
  popover: '8px',
  control: '6px',
  chip: '10px',
  pill: '999px',
} as const;

/* ------------------------------------------------------------------ */
/* 2.4 — Spacing (4px base)                                            */
/* ------------------------------------------------------------------ */

/** 4 / 8 / 12 / 16 / 24 / 32 */
export const spacing = {
  4: 4,
  8: 8,
  12: 12,
  16: 16,
  24: 24,
  32: 32,
} as const;

export const spacingPx = {
  4: '4px',
  8: '8px',
  12: '12px',
  16: '16px',
  24: '24px',
  32: '32px',
} as const;

/* ------------------------------------------------------------------ */
/* 2.5 — Typography (system fonts, zero download)                      */
/* ------------------------------------------------------------------ */

export const fonts = {
  /** Latin 正文/UI + CJK fallback */
  ui: '"Segoe UI Variable Text", "Segoe UI", "Microsoft YaHei UI", "微软雅黑", sans-serif',
  /** 对话框标题 */
  display:
    '"Segoe UI Variable Display", "Microsoft YaHei UI", "微软雅黑", sans-serif',
  /** API Key 输入等 mono 场景 */
  mono: '"Cascadia Mono", Consolas, monospace',
} as const;

/** 字重只允许 400 / 500 / 600 三档 (spec §2.5) */
export const fontWeights = {
  regular: 400,
  medium: 500,
  semibold: 600,
} as const;

export const fontSizes = {
  /** 次要/脚注 12px; 标题栏应用名 12px/500; 输入标签 12px/500 */
  xs: 12,
  /** API Key 输入 (mono) 13px */
  mono: 13,
  /** 正文/按钮 14px/400, 按钮 14px/500 */
  sm: 14,
  /** 对话框标题 18px/600 */
  lg: 18,
} as const;

export const lineHeights = {
  /** CJK 正文 行高 1.6 */
  body: 1.6,
  /** 对话框标题 行高 1.4 */
  title: 1.4,
} as const;

/* ------------------------------------------------------------------ */
/* 2.6 — Elevation (hairline first; shadow only for floating layers)   */
/* ------------------------------------------------------------------ */

export const shadows = {
  dialogLight: '0 8px 24px rgba(15,20,35,0.10)',
  dialogDark: '0 8px 24px rgba(0,0,0,0.45)',
  popover: '0 4px 12px rgba(15,20,35,0.08)',
} as const;

/* ------------------------------------------------------------------ */
/* 5 — Motion (transform/opacity only; durations & easing)             */
/* ------------------------------------------------------------------ */

export const motion = {
  /** 对话框入场 fade + scale: 140ms, cubic-bezier(0.16, 1, 0.3, 1) */
  dialogInMs: 140,
  /** 对话框退场: 100ms, 同曲线 */
  dialogOutMs: 100,
  /** 遮罩 (scrim): 仅 opacity, 120ms 线性 */
  scrimMs: 120,
  /** 控制钮/按钮悬停背景色过渡: 100ms ease-out */
  hoverMs: 100,
  /** 主按钮按下 scale(0.97): 80ms */
  pressMs: 80,
  /** 状态点颜色切换: 150ms, 不脉冲 */
  statusMs: 150,
  /** 验证 spinner: 800ms/圈 (唯一允许的循环动画) */
  spinnerMs: 800,
  easingStandard: 'cubic-bezier(0.16, 1, 0.3, 1)',
  easingOut: 'ease-out',
  easingLinear: 'linear',
} as const;

/* ------------------------------------------------------------------ */
/* Layout anchors used by main process (spec §2.4 / §3)                */
/* ------------------------------------------------------------------ */

export const window = {
  /** 最小窗口 800×560 */
  minWidth: 800,
  minHeight: 560,
  /** 默认窗口 1080×720 */
  defaultWidth: 1080,
  defaultHeight: 720,
  /** 标题栏高 36px (整条可拖动) */
  titleBarHeight: 36,
  /** 窗口控制钮命中区 46×36px */
  controlButtonWidth: 46,
  controlButtonHeight: 36,
} as const;

export const titleBar = {
  /** 标题栏左侧 8px 起 (spec §3.1) */
  paddingLeft: 8,
  /** 状态点 6px 圆点, 与名字间距 8px (spec §3.1) */
  statusDotSize: 6,
  statusDotGap: 8,
} as const;

/** Window chrome background color (WebView2 native window). */
export function windowBackgroundColor(dark: boolean): string {
  return dark ? colorsDark['bg-window'] : colorsLight['bg-window'];
}
