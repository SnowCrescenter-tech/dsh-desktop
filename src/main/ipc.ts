/**
 * 契约 IPC 处理器注册 (T15 组合根的一部分)。
 *
 * 职责边界 (与 window.ts / onboarding.ts 的既有注册面严格互补, 不重复注册):
 *   - window:* 通道由 window.ts 的 createWindowController 注册 (最小化/最大化/关闭…);
 *   - onboarding:* 通道由 onboarding.ts 的 registerOnboardingIpc 注册;
 *   - 本模块注册其余全部契约通道: autolaunch.get/set、native.notify、web.broadcast,
 *     并导出状态推送 (status:on-state) 与"窗口内错误视图"(含重试) 的辅助函数。
 *
 * 所有 handler 均可注入 ipcMain, 便于 vitest 用 fake 驱动 (与 window.ts 同款分层)。
 */
import { ipcMain } from 'electron';
import type { BrowserWindow, IpcMain, WebContents } from 'electron';

import {
  autolaunchChannels,
  nativeChannels,
  statusChannels,
  webChannels,
  type NotificationPayload,
  type ServiceStatus,
  type SetAutolaunchPayload,
  type WebCommand,
} from '../shared/contract.js';
import type { Autolaunch } from './autolaunch.js';
import type { Notifier } from './notifications.js';

/** 可注入的 ipcMain 注册面 (仅声明用到的成员) */
export type IpcMainLike = Pick<IpcMain, 'handle' | 'removeHandler'>;

/** registerIpcHandlers 的依赖 */
export interface RegisterIpcDeps {
  /** 开机自启服务 (autolaunch.get / autolaunch.set 的落地实现) */
  autolaunch: Autolaunch;
  /** 原生通知服务 (native.notify 的落地实现) */
  notifier: Notifier;
  /** 把托盘/Web 命令推送到 dsh Web UI (web.broadcast 的落地实现) */
  broadcastToWeb: (command: WebCommand) => void;
}

/** 错误视图"重试"按钮的哨兵导航地址; 主进程在 will-navigate 拦截它 */
export const RETRY_URL = 'dsh-desktop://retry';

/**
 * 从主窗口的 contentView 子视图里找出承载 dsh Web UI 的 WebContentsView。
 * window.ts 内部创建视图但未暴露引用, 这里用鸭子类型 (webContents 属性) 定位,
 * 不依赖 instanceof, 测试注入 fake 也无需 electron 实例。
 */
export function findDshWebContents(win: BrowserWindow): WebContents | null {
  for (const child of win.contentView.children) {
    const candidate = child as { webContents?: WebContents };
    if (candidate.webContents !== undefined) {
      return candidate.webContents;
    }
  }
  return null;
}

/** 已挂接 will-navigate 重试拦截的 webContents (防止多次 showErrorView 重复挂监听) */
const retryWired = new WeakSet<WebContents>();
/** 各 webContents 上最新的重试回调 (showErrorView 每次调用都会刷新) */
const retryHandlers = new WeakMap<WebContents, () => void>();

/**
 * 把服务状态推送给标题栏渲染层 (main→renderer 单向推送)。
 * 状态点订阅的是 statusChannels.onState, 由 preload 暴露的 status.onState 消费。
 */
export function sendServiceStatus(win: BrowserWindow, status: ServiceStatus): void {
  if (win.isDestroyed()) {
    return;
  }
  win.webContents.send(statusChannels.onState, status);
}

/** HTML 转义 (错误信息是用户可见文本, 不能让它注入错误页的 DOM) */
function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
  );
}

/** 构建窗口内错误视图的 data: URL (内联样式 + 重试按钮, 零外部资源) */
export function buildErrorDataUrl(message: string): string {
  const html =
    '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">' +
    '<style>' +
    'body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;' +
    "background:#F4F6F9;font-family:'Segoe UI','Microsoft YaHei UI',sans-serif;color:#1A1D21}" +
    '.card{text-align:center;max-width:440px;padding:24px}' +
    'h1{font-size:18px;font-weight:600;margin:0 0 8px}' +
    'p{font-size:14px;line-height:1.6;color:#5F6672;margin:0 0 24px;word-break:break-all}' +
    'button{font-size:14px;padding:8px 24px;border:none;border-radius:6px;cursor:pointer;' +
    'background:#4D6BFE;color:#fff}' +
    'button:hover{background:#3A57F0}' +
    '</style></head><body><div class="card">' +
    '<h1>本地服务启动失败</h1>' +
    `<p>${escapeHtml(message)}</p>` +
    `<button onclick="location.href='${RETRY_URL}'">重试</button>` +
    '</div></body></html>';
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

/**
 * 在 dsh Web UI 视图内展示错误页 (含"重试"按钮)。
 * 重试按钮把页面导航到哨兵地址 RETRY_URL, 主进程在 will-navigate 拦截后调用 onRetry;
 * 页面自身不需要任何 IPC 能力 (视图是 sandbox 的, 没有 preload)。
 */
export function showErrorView(
  win: BrowserWindow,
  message: string,
  onRetry: () => void,
): void {
  const web = findDshWebContents(win);
  if (web === null) {
    return;
  }
  retryHandlers.set(web, onRetry);
  if (!retryWired.has(web)) {
    retryWired.add(web);
    web.on('will-navigate', (event, url) => {
      if (url !== RETRY_URL) {
        return;
      }
      event.preventDefault();
      retryHandlers.get(web)?.();
    });
  }
  void web.loadURL(buildErrorDataUrl(message));
}

/**
 * 注册本模块负责的全部契约通道。
 *
 * @param deps 依赖 (autolaunch / notifier / broadcastToWeb)
 * @param ipc  可注入的 ipcMain (测试传 fake), 默认 electron.ipcMain
 * @returns dispose: 解除全部由本函数注册的 handler
 */
export function registerIpcHandlers(
  deps: RegisterIpcDeps,
  ipc: IpcMainLike = ipcMain,
): () => void {
  ipc.handle(autolaunchChannels.get, () => deps.autolaunch.isEnabled());

  ipc.handle(autolaunchChannels.set, (_event, payload: SetAutolaunchPayload) => {
    // 渲染层负载可能被篡改: 只接受 boolean
    if (typeof payload?.enabled !== 'boolean') {
      return;
    }
    return deps.autolaunch.setEnabled(payload.enabled);
  });

  ipc.handle(nativeChannels.notify, (_event, payload: NotificationPayload) => {
    if (typeof payload?.title !== 'string' || typeof payload.body !== 'string') {
      return;
    }
    deps.notifier.notify({ title: payload.title, body: payload.body });
  });

  ipc.handle(webChannels.broadcast, (_event, command: WebCommand) => {
    deps.broadcastToWeb(command);
  });

  return () => {
    for (const channel of [
      autolaunchChannels.get,
      autolaunchChannels.set,
      nativeChannels.notify,
      webChannels.broadcast,
    ]) {
      ipc.removeHandler(channel);
    }
  };
}
