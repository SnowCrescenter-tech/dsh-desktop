/**
 * ipc.ts 契约处理器测试 —— 注入 fake ipcMain / autolaunch / notifier 驱动。
 *
 * 守护的不变量:
 *   - 本模块只注册 autolaunch / native / web 通道 (window:* 由 window.ts 注册,
 *     onboarding:* 由 onboarding.ts 注册, 不重复注册);
 *   - autolaunch:get/set 转发到注入的 Autolaunch (非法负载不落盘);
 *   - native:notify 转发到注入的 Notifier;
 *   - web:broadcast 经 broadcastToWeb 转发给主窗口渲染层;
 *   - findDshWebContents 能从 contentView.children 定位 dsh WebContentsView;
 *   - showErrorView 把错误页载入 dsh 视图, 并拦截"重试"哨兵导航;
 *   - dispose 移除全部由本函数注册的 handler。
 */
import type { BrowserWindow, IpcMain } from 'electron';
import { describe, expect, it, vi } from 'vitest';

import {
  autolaunchChannels,
  nativeChannels,
  webChannels,
} from '../../shared/contract.js';
import type { WebCommand } from '../../shared/contract.js';
import {
  buildErrorDataUrl,
  findDshWebContents,
  registerIpcHandlers,
  RETRY_URL,
  showErrorView,
} from '../ipc.js';
import type { IpcMainLike, RegisterIpcDeps } from '../ipc.js';
import type { Autolaunch } from '../autolaunch.js';
import type { Notifier } from '../notifications.js';

/** 可注入的 fake ipcMain (handle / removeHandler) */
function makeIpcMain() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  return {
    handle: vi.fn((channel: string, listener: (...args: unknown[]) => unknown) => {
      handlers.set(channel, listener);
    }),
    removeHandler: vi.fn((channel: string) => {
      handlers.delete(channel);
    }),
    handlers,
  };
}

/** 构造 registerIpcHandlers 的依赖 */
function makeDeps() {
  const autolaunch: Autolaunch = {
    isEnabled: vi.fn(async () => true),
    setEnabled: vi.fn(async () => {}),
  };
  const notifier: Notifier = { notify: vi.fn() };
  const broadcastToWeb = vi.fn();
  const deps: RegisterIpcDeps = { autolaunch, notifier, broadcastToWeb };
  return { ...deps, autolaunch, notifier, broadcastToWeb };
}

/** 造一个带 webContents 的 fake 主窗口 (findDshWebContents 的输入) */
function makeWindow() {
  const webContents = {
    send: vi.fn(),
    loadURL: vi.fn(async (_url: string) => {}),
    on: vi.fn(),
    isDestroyed: vi.fn(() => false),
  };
  const win = {
    contentView: { children: [{ webContents }] },
  } as unknown as BrowserWindow;
  return { win, webContents };
}

describe('registerIpcHandlers — 通道注册', () => {
  it('注册 autolaunch / native / web 通道, 不触碰 window:* 与 onboarding:*', () => {
    const ipc = makeIpcMain();
    registerIpcHandlers(makeDeps(), ipc as unknown as IpcMainLike);
    const channels = ipc.handle.mock.calls.map((call) => call[0]);
    expect(new Set(channels)).toEqual(
      new Set([
        autolaunchChannels.get,
        autolaunchChannels.set,
        nativeChannels.notify,
        webChannels.broadcast,
      ]),
    );
    expect(channels).not.toContain('window:minimize');
    expect(channels).not.toContain('onboarding:submit-key');
  });

  it('dispose 移除全部由本函数注册的 handler', () => {
    const ipc = makeIpcMain();
    const dispose = registerIpcHandlers(makeDeps(), ipc as unknown as IpcMainLike);
    dispose();
    expect(ipc.handlers.size).toBe(0);
    expect(ipc.removeHandler.mock.calls.length).toBe(4);
  });
});

describe('registerIpcHandlers — autolaunch', () => {
  it('autolaunch:get 返回 isEnabled 的结果', async () => {
    const ipc = makeIpcMain();
    const deps = makeDeps();
    deps.autolaunch.isEnabled = vi.fn(async () => false);
    registerIpcHandlers(deps, ipc as unknown as IpcMainLike);
    const handler = ipc.handlers.get(autolaunchChannels.get);
    expect(handler).toBeDefined();
    await expect((handler as () => unknown)()).resolves.toBe(false);
  });

  it('autolaunch:set 把 {enabled} 转发给 setEnabled', async () => {
    const ipc = makeIpcMain();
    const deps = makeDeps();
    registerIpcHandlers(deps, ipc as unknown as IpcMainLike);
    const handler = ipc.handlers.get(autolaunchChannels.set);
    await (handler as (event: unknown, payload: { enabled: boolean }) => unknown)(
      null,
      { enabled: true },
    );
    expect(deps.autolaunch.setEnabled).toHaveBeenCalledWith(true);
  });

  it('autolaunch:set 收到非 boolean enabled 时忽略 (不落盘)', async () => {
    const ipc = makeIpcMain();
    const deps = makeDeps();
    registerIpcHandlers(deps, ipc as unknown as IpcMainLike);
    const handler = ipc.handlers.get(autolaunchChannels.set);
    await (handler as (event: unknown, payload: unknown) => unknown)(null, { enabled: 'yes' });
    await (handler as (event: unknown, payload: unknown) => unknown)(null, null);
    expect(deps.autolaunch.setEnabled).not.toHaveBeenCalled();
  });
});

describe('registerIpcHandlers — native.notify', () => {
  it('转发 {title, body} 给 notifier.notify', () => {
    const ipc = makeIpcMain();
    const deps = makeDeps();
    registerIpcHandlers(deps, ipc as unknown as IpcMainLike);
    const handler = ipc.handlers.get(nativeChannels.notify);
    (handler as (event: unknown, payload: { title: string; body: string }) => unknown)(
      null,
      { title: 't', body: 'b' },
    );
    expect(deps.notifier.notify).toHaveBeenCalledWith({ title: 't', body: 'b' });
  });

  it('负载缺字段时忽略', () => {
    const ipc = makeIpcMain();
    const deps = makeDeps();
    registerIpcHandlers(deps, ipc as unknown as IpcMainLike);
    const handler = ipc.handlers.get(nativeChannels.notify);
    (handler as (event: unknown, payload: unknown) => unknown)(null, { title: 1 });
    (handler as (event: unknown, payload: unknown) => unknown)(null, undefined);
    expect(deps.notifier.notify).not.toHaveBeenCalled();
  });
});

describe('registerIpcHandlers — web.broadcast', () => {
  it('把托盘命令转发给 broadcastToWeb', () => {
    const ipc = makeIpcMain();
    const deps = makeDeps();
    registerIpcHandlers(deps, ipc as unknown as IpcMainLike);
    const handler = ipc.handlers.get(webChannels.broadcast);
    const command: WebCommand = { command: 'show-about' };
    (handler as (event: unknown, payload: WebCommand) => unknown)(null, command);
    expect(deps.broadcastToWeb).toHaveBeenCalledWith(command);
  });
});

describe('findDshWebContents — 定位 dsh WebContentsView', () => {
  it('返回 contentView.children 中带 webContents 的子视图', () => {
    const { win, webContents } = makeWindow();
    expect(findDshWebContents(win)).toBe(webContents);
  });

  it('无子视图时返回 null', () => {
    const win = { contentView: { children: [] } } as unknown as BrowserWindow;
    expect(findDshWebContents(win)).toBeNull();
  });
});

describe('showErrorView — 窗口内错误视图 + 重试拦截', () => {
  it('把错误页载入 dsh 视图 (data: URL 含消息与重试按钮)', () => {
    const { win, webContents } = makeWindow();
    showErrorView(win, 'boom', () => {});
    expect(webContents.loadURL).toHaveBeenCalledTimes(1);
    const url = String(webContents.loadURL.mock.calls[0]?.[0] ?? '');
    expect(url.startsWith('data:text/html')).toBe(true);
    expect(decodeURIComponent(url)).toContain('boom');
    expect(decodeURIComponent(url)).toContain('重试');
  });

  it('拦截"重试"哨兵导航并调用 onRetry, 其它导航放行', () => {
    const { win, webContents } = makeWindow();
    const onRetry = vi.fn();
    const preventDefault = vi.fn();
    showErrorView(win, 'boom', onRetry);

    // 捕获注册的 will-navigate 监听器
    const handler = (webContents.on.mock.calls.find(
      (call) => call[0] === 'will-navigate',
    )?.[1] ?? null) as ((event: { preventDefault: () => void }, url: string) => void) | null;
    expect(handler).not.toBeNull();
    if (handler === null) return;

    handler({ preventDefault }, 'https://other.example');
    expect(preventDefault).not.toHaveBeenCalled();
    expect(onRetry).not.toHaveBeenCalled();

    handler({ preventDefault }, RETRY_URL);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('buildErrorDataUrl', () => {
  it('消息中 HTML 特殊字符被转义 (防止注入)', () => {
    const url = buildErrorDataUrl('<script>alert(1)</script>');
    const decoded = decodeURIComponent(url);
    expect(decoded).not.toContain('<script>');
    expect(decoded).toContain('&lt;script&gt;');
  });
});

// 类型使用占位: 确保 electron 类型导入被测试正确引用 (compile-time surface)
void (null as unknown as IpcMain);
