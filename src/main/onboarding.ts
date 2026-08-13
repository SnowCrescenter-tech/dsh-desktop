/**
 * 首次运行引导对话框 (design spec §4) — 子窗口 + submit-key / dismiss IPC。
 *
 * 流程:
 *   - 启动时 hasSavedApiKey() 为 false 才创建 (spec §4: 仅在无 Key 时弹出);
 *   - 子 BrowserWindow: parent = 主窗口, modal, frameless, 固定 420px 宽
 *     (spec §4: 内容绝不缩放/动画宽度), 内容高 372px 固定, 不可缩放;
 *   - 入场: 窗口整体 opacity 0→1 (spec §5 scrim 遮罩 120ms 线性) +
 *     渲染层自身 fade+scale 140ms; 退场由渲染层动画后经 onboarding:dismiss 关闭;
 *   - "稍后再说" / ESC / 保存成功: 渲染层请求 dismiss —— 本模块直接 close 对话框
 *     (区别于 window:close → 隐藏主窗口到托盘, 该通道由 window.ts 独占);
 *   - 提交: 收到 onboarding:submit-key 负载 → validateKey 校验 →
 *     writeKey 写入 `<dshHome>/.env` (shared/dotenv.ts) → 返回 SubmitKeyResult。
 */
import { BrowserWindow, ipcMain, nativeTheme, type IpcMainInvokeEvent } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  onboardingChannels,
  type SubmitKeyPayload,
} from '../shared/contract.js';
import { validateKey } from '../shared/key-validation.js';
import { colorsDark, colorsLight, motion } from '../shared/tokens.js';
import { hasKey, writeKey } from './key-store.js';
import { resolveDshHome } from './profile/resolve.js';

// ESM 下无 __dirname, 基于 import.meta.url 推导构建产物所在目录 (dist/main)。
const appDir = dirname(fileURLToPath(import.meta.url));

/** 引导对话框固定宽度 (spec §4) — 该值绝不被动画或缩放 */
export const ONBOARDING_WIDTH = 420;

/** 引导对话框固定内容高度 (与 onboarding.css 的垂直节奏一致) */
export const ONBOARDING_HEIGHT = 372;

/** 当前打开的引导窗口; 关闭后置回 null (供 dismiss 通道判定目标) */
let onboardingWindow: BrowserWindow | null = null;

/** scrim 遮罩动画的步进间隔 (与 60fps 对齐) */
const SCRIM_STEP_MS = 16;

/**
 * 是否存在已保存的 API Key —— 引导对话框的显示条件 (spec §4)。
 * true = 已配置, 跳过引导; false = 首次运行, 弹出引导。
 */
export function hasSavedApiKey(): boolean {
  return hasKey(resolveDshHome());
}

/** 窗口整体 opacity 0→1 (spec §5 scrim: 仅 opacity, 120ms 线性) */
function animateScrimIn(win: BrowserWindow): void {
  const start = performance.now();
  const step = (): void => {
    if (win.isDestroyed()) return;
    const progress = Math.min(1, (performance.now() - start) / motion.scrimMs);
    win.setOpacity(progress);
    if (progress < 1) {
      setTimeout(step, SCRIM_STEP_MS);
    }
  };
  step();
}

/**
 * 创建并显示引导对话框 (模态子窗口)。
 * 主窗口尚未可见时, 等主窗口 show 后再弹, 避免模态浮在空屏幕上。
 */
export function createOnboardingWindow(parent: BrowserWindow): BrowserWindow {
  const dark = nativeTheme.shouldUseDarkColors;
  const win = new BrowserWindow({
    width: ONBOARDING_WIDTH,
    height: ONBOARDING_HEIGHT,
    useContentSize: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    show: false,
    frame: false,
    parent,
    modal: true,
    center: true,
    autoHideMenuBar: true,
    // 预载页面前先铺好表面色, 避免白闪 (spec §2.6 表面色)
    backgroundColor: dark ? colorsDark['bg-surface'] : colorsLight['bg-surface'],
    webPreferences: {
      // 与主窗口同一份 ESM preload (contract 通道白名单)
      preload: join(appDir, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  onboardingWindow = win;
  win.on('closed', () => {
    if (onboardingWindow === win) onboardingWindow = null;
  });

  win.once('ready-to-show', () => {
    const show = (): void => {
      if (win.isDestroyed()) return;
      win.setOpacity(0);
      win.show();
      animateScrimIn(win);
    };
    if (parent.isVisible()) {
      show();
    } else {
      parent.once('show', show);
    }
  });

  // dev 模式加载 dev server 的同路径页面; 生产加载构建产物
  const devServerUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devServerUrl) {
    void win.loadURL(`${devServerUrl}/onboarding/index.html`);
  } else {
    void win.loadFile(join(appDir, '../renderer/onboarding/index.html'));
  }

  return win;
}

/**
 * 注册引导相关 IPC (应用启动时调用一次)。
 *   - onboarding:submit-key: 校验 + 持久化, 返回 SubmitKeyResult;
 *   - onboarding:dismiss: 关闭引导对话框 (ESC / 稍后再说 / 成功退场)。
 *     与 window:close (主窗口隐藏到托盘, 由 window.ts 注册) 语义不同。
 */
export function registerOnboardingIpc(): void {
  ipcMain.handle(
    onboardingChannels.submitKey,
    async (_event: IpcMainInvokeEvent, payload: SubmitKeyPayload) => {
      const rawKey = typeof payload?.key === 'string' ? payload.key : '';
      const validation = validateKey(rawKey);
      if (!validation.ok) {
        return { ok: false, error: validation.error };
      }
      try {
        writeKey(resolveDshHome(), validation.key);
        return { ok: true };
      } catch {
        return { ok: false, error: 'Key 保存失败，请重试' };
      }
    },
  );

  ipcMain.handle(onboardingChannels.dismiss, () => {
    if (onboardingWindow !== null && !onboardingWindow.isDestroyed()) {
      onboardingWindow.close();
    }
  });
}
