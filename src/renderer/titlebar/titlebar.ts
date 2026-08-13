/**
 * 标题栏渲染逻辑 (设计规范 §3.1)。
 *
 * 职责:
 *  - 鲸鱼图标: 注入 resources/titlebar-whale.svg 线稿, 把资源内硬编码的
 *    品牌蓝替换为 currentColor, 颜色由 CSS 令牌 (--accent) 驱动;
 *  - 服务状态点: 订阅 window.dshDesktop.status.onState, 按 phase 映射
 *    data-tone (纯映射逻辑见 status-dot.ts), 驱动 6px 圆点颜色;
 *  - 窗口控制钮: 最小化 / 最大化-还原 / 关闭 (隐藏到托盘), 调用桥接方法;
 *  - 窗口状态: window.getState 拉取 maximized (切换 □/❐) 与 focused
 *    (未聚焦整条降为 text-tertiary); DOM focus/blur/resize 时刷新,
 *    resize 覆盖原生双击拖拽区最大化导致的字形失同步。
 */

import { colorsLight } from '../../shared/tokens.js';
import type { ServiceStatus, WindowState } from '../../shared/contract.js';
import { statusDotTone } from './status-dot.js';
import whaleSvgRaw from '../../../resources/titlebar-whale.svg?raw';

/** 资源线稿内的硬编码品牌蓝 (resources/titlebar-whale.svg) — 与 tokens.ts 同源 */
const WHALE_ACCENT = colorsLight.accent;

function requireEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (el === null) {
    throw new Error(`[titlebar] 缺少必需元素 #${id}`);
  }
  return el as T;
}

function main(): void {
  const dsh = window.dshDesktop;
  if (dsh === undefined) {
    // 非桌面环境 (纯浏览器打开) 时静默降级为静态标题栏
    return;
  }

  const titlebar = requireEl<HTMLElement>('titlebar');
  const whale = requireEl<HTMLElement>('titlebar-whale');
  const statusDot = requireEl<HTMLElement>('status-dot');
  const btnMinimize = requireEl<HTMLButtonElement>('btn-minimize');
  const btnMaximize = requireEl<HTMLButtonElement>('btn-maximize');
  const btnClose = requireEl<HTMLButtonElement>('btn-close');

  /* ---- 鲸鱼图标 (§3.1): 线稿复用资源文件, 颜色跟随主题令牌 ---- */
  whale.innerHTML = whaleSvgRaw.replaceAll(WHALE_ACCENT, 'currentColor');

  /* ---- 服务状态点 (§3.1): running→teal / starting+stopped→tertiary / error→error ---- */
  dsh.status.onState((state: ServiceStatus) => {
    statusDot.dataset['tone'] = statusDotTone(state);
  });
  // 订阅前无推送时保持 HTML 默认 data-tone="starting" (tertiary)

  /* ---- 窗口控制钮 (§3.1): 命中区 46×36, 行为委托主进程 ---- */
  btnMinimize.addEventListener('click', () => {
    void dsh.window.minimize();
  });
  btnClose.addEventListener('click', () => {
    // 设计规范 §3.3: 关闭 = 隐藏到托盘, 真正退出走托盘菜单
    void dsh.window.close();
  });

  let maximized = false;

  const applyWindowState = (state: WindowState): void => {
    maximized = state.maximized;
    btnMaximize.textContent = state.maximized ? '❐' : '□';
    btnMaximize.setAttribute('aria-label', state.maximized ? '还原' : '最大化');
    titlebar.classList.toggle('inactive', !state.focused);
  };

  const refreshWindowState = (): void => {
    void dsh.window.getState().then(applyWindowState);
  };

  btnMaximize.addEventListener('click', () => {
    if (maximized) {
      void dsh.window.unmaximize().then(refreshWindowState);
    } else {
      void dsh.window.maximize().then(refreshWindowState);
    }
  });

  /* ---- 窗口状态同步 ---- */
  window.addEventListener('focus', refreshWindowState);
  window.addEventListener('blur', refreshWindowState);
  window.addEventListener('resize', refreshWindowState); // 最大化/还原必然 resize
  refreshWindowState();
}

main();
