/**
 * 无边框窗口控制器测试 —— 注入 app/BrowserWindow/WebContentsView/ipcMain mock 驱动。
 *
 * 守护设计规范 §3 的关键不变量:
 *   - 无边框 + 隐藏启动 + ready-to-show 后再显示 (杜绝白闪);
 *   - 36px 标题栏下方的单个 WebContentsView 承载 dsh URL, 隐藏不销毁;
 *   - 标题栏关闭钮 (window:close) → hide() 而非销毁; restore() 瞬时恢复;
 *   - Win11 (build ≥ 22000) 才应用 DWM 圆角, Win10 跳过;
 *   - Windows 下写入 AppUserModelId; Per-Monitor v2 DPI 开关。
 */
import type {
  BrowserWindow,
  BrowserWindowConstructorOptions,
  IpcMain,
  Rectangle,
  WebContentsView,
  WebContentsViewConstructorOptions,
} from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { windowChannels } from '../../shared/contract.js';
import {
  APP_USER_MODEL_ID,
  buildWindowOptions,
  configureAppIdentity,
  createWindowController,
  DEFAULT_DSH_URL,
  enablePerMonitorV2,
  layoutContentArea,
  type DshWindowController,
  type WindowControllerDeps,
} from '../window.js';

/* ------------------------------------------------------------------ */
/* 可注入 fake 对象                                                     */
/* ------------------------------------------------------------------ */

type Listener = (...args: unknown[]) => void;

class FakeBrowserWindow {
  static instances: FakeBrowserWindow[] = [];

  readonly options: BrowserWindowConstructorOptions;
  readonly listeners = new Map<string, Listener[]>();
  shown = false;
  hidden = true; // 构造即隐藏 (show:false)
  destroyed = false;
  maximized = false;
  focused = false;
  readonly contentView = { addChildView: vi.fn() };
  readonly webContents = { setWindowOpenHandler: vi.fn() };
  readonly loadFile = vi.fn(async (_path: string) => {});
  readonly loadURL = vi.fn(async (_path: string) => {});
  readonly getContentSize = vi.fn(() => [1080, 720] as [number, number]);
  readonly getNativeWindowHandle = vi.fn(() => Buffer.alloc(8));

  constructor(options: BrowserWindowConstructorOptions) {
    this.options = options;
    FakeBrowserWindow.instances.push(this);
  }

  on(event: string, listener: Listener): this {
    const set = this.listeners.get(event) ?? [];
    set.push(listener);
    this.listeners.set(event, set);
    return this;
  }

  emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(...args);
    }
  }

  show(): void {
    this.shown = true;
    this.hidden = false;
  }

  hide(): void {
    this.hidden = true;
    this.shown = false;
  }

  focus(): void {
    this.focused = true;
  }

  close(): void {
    this.destroyed = true;
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  isVisible(): boolean {
    return !this.hidden;
  }

  isMaximized(): boolean {
    return this.maximized;
  }

  isFocused(): boolean {
    return this.focused;
  }

  minimize(): void {
    /* 测试无需关心内部行为 */
  }

  maximize(): void {
    this.maximized = true;
  }

  unmaximize(): void {
    this.maximized = false;
  }
}

class FakeWebContentsView {
  static instances: FakeWebContentsView[] = [];

  bounds: Rectangle | null = null;
  visible = true;
  readonly webContents = { loadURL: vi.fn(async (_url: string) => {}) };

  constructor(_options?: WebContentsViewConstructorOptions) {
    FakeWebContentsView.instances.push(this);
  }

  setBounds(bounds: Rectangle): void {
    this.bounds = bounds;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
  }
}

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

/** 取数组最后一项 (测试夹具用, 避免 noUncheckedIndexedAccess 报错) */
function last<T>(items: T[]): T {
  const value = items[items.length - 1];
  if (value === undefined) {
    throw new Error('夹具不存在 (未创建实例)');
  }
  return value;
}

function makeDeps(overrides: Partial<WindowControllerDeps> = {}) {
  const ipc = makeIpcMain();
  const app = { setAppUserModelId: vi.fn() };
  const commandLine = { appendSwitch: vi.fn() };
  const deps: WindowControllerDeps = {
    platform: 'win32',
    release: '10.0.22631',
    app,
    BrowserWindow: FakeBrowserWindow as unknown as typeof BrowserWindow,
    WebContentsView: FakeWebContentsView as unknown as typeof WebContentsView,
    ipcMain: ipc as unknown as Pick<IpcMain, 'handle' | 'removeHandler'>,
    ...overrides,
  };
  return {
    deps,
    ipc,
    app,
    commandLine,
    window: () => last(FakeBrowserWindow.instances),
    view: () => last(FakeWebContentsView.instances),
  };
}

/* ------------------------------------------------------------------ */
/* buildWindowOptions / layoutContentArea (纯函数)                     */
/* ------------------------------------------------------------------ */

describe('buildWindowOptions — 无边框窗口选项', () => {
  it('frame:false + titleBarStyle:hidden (无边框自绘标题栏)', () => {
    const options = buildWindowOptions();
    expect(options.frame).toBe(false);
    expect(options.titleBarStyle).toBe('hidden');
  });

  it('尺寸取设计令牌: 最小 800×560, 默认 1080×720', () => {
    const options = buildWindowOptions();
    expect(options.width).toBe(1080);
    expect(options.height).toBe(720);
    expect(options.minWidth).toBe(800);
    expect(options.minHeight).toBe(560);
  });

  it('背景色取浅色令牌 #F4F6F9, 且 show:false (隐藏启动防白闪)', () => {
    const options = buildWindowOptions();
    expect(options.backgroundColor).toBe('#F4F6F9');
    expect(options.show).toBe(false);
  });

  it('预加载脚本指向 preload 产物, 且开启 contextIsolation', () => {
    const options = buildWindowOptions();
    expect(options.webPreferences?.preload).toMatch(/preload[\\/]index\.mjs$/);
    expect(options.webPreferences?.contextIsolation).toBe(true);
    expect(options.webPreferences?.nodeIntegration).toBe(false);
  });
});

describe('layoutContentArea — 标题栏下方内容区', () => {
  it('默认 1080×720 时, 内容区为 y=36 起的 684px 高', () => {
    expect(layoutContentArea(1080, 720)).toEqual({ x: 0, y: 36, width: 1080, height: 684 });
  });

  it('最小 800×560 时, 内容区高 524px', () => {
    expect(layoutContentArea(800, 560)).toEqual({ x: 0, y: 36, width: 800, height: 524 });
  });

  it('高度小于标题栏时内容区高度钳制为 0 (不产生负值)', () => {
    expect(layoutContentArea(800, 20).height).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* createWindowController — 主窗口装配                                 */
/* ------------------------------------------------------------------ */

describe('createWindowController — 窗口装配', () => {
  beforeEach(() => {
    FakeBrowserWindow.instances = [];
    FakeWebContentsView.instances = [];
  });

  it('以 buildWindowOptions 构造 BrowserWindow, 并注册 ready-to-show → show', () => {
    const { deps, window: getWin } = makeDeps();
    createWindowController(deps);
    const win = getWin();
    expect(win.options.frame).toBe(false);
    expect(win.shown).toBe(false); // 尚未 ready-to-show

    win.emit('ready-to-show');
    expect(win.shown).toBe(true); // ready 后立即显示, 无白闪
  });

  it('创建单个 WebContentsView, 置于标题栏下方并加载默认 dsh 地址', () => {
    const { deps, window: getWin, view: getView } = makeDeps();
    const controller = createWindowController(deps);
    const win = getWin();
    const view = getView();

    expect(win.contentView.addChildView).toHaveBeenCalledWith(view);
    expect(view.bounds).toEqual({ x: 0, y: 36, width: 1080, height: 684 });
    expect(view.webContents.loadURL).toHaveBeenCalledWith(DEFAULT_DSH_URL);
    expect(controller).toBeDefined();
  });

  it('标题栏 renderer: dev 走 dev server, prod 走 dist/renderer 产物', () => {
    const dev = makeDeps({ rendererDevUrl: 'http://localhost:5173' });
    createWindowController(dev.deps);
    expect(dev.window().loadURL).toHaveBeenCalledWith('http://localhost:5173');
    expect(dev.window().loadFile).not.toHaveBeenCalled();

    FakeBrowserWindow.instances = [];
    FakeWebContentsView.instances = [];
    const prod = makeDeps();
    createWindowController(prod.deps);
    const prodWin = prod.window();
    const fileArg = String(prodWin.loadFile.mock.calls[0]?.[0] ?? '').replace(/\\/g, '/');
    expect(fileArg).toMatch(/renderer\/index\.html$/);
  });

  it('窗口缩放时重排内容区 (resize / resized)', () => {
    const { deps, window: getWin, view: getView } = makeDeps();
    createWindowController(deps);
    const win = getWin();
    const view = getView();

    win.getContentSize.mockReturnValue([1280, 800]);
    win.emit('resize');
    expect(view.bounds).toEqual({ x: 0, y: 36, width: 1280, height: 764 });
  });

  it('注册全部 window:* IPC 通道处理器', () => {
    const { deps, ipc } = makeDeps();
    createWindowController(deps);
    const channels = ipc.handle.mock.calls.map((call) => call[0]);
    expect(new Set(channels)).toEqual(new Set(Object.values(windowChannels)));
  });
});

/* ------------------------------------------------------------------ */
/* close → hide / restore / loadDshUrl                                 */
/* ------------------------------------------------------------------ */

describe('窗口行为 — 关闭隐藏 / 恢复 / 换址', () => {
  beforeEach(() => {
    FakeBrowserWindow.instances = [];
    FakeWebContentsView.instances = [];
  });

  function createWithCloseHandler() {
    const ctx = makeDeps();
    const controller = createWindowController(ctx.deps);
    const closeHandler = ctx.ipc.handlers.get(windowChannels.close);
    if (closeHandler === undefined) {
      throw new Error('window:close 处理器未注册');
    }
    return { ...ctx, controller, closeHandler };
  }

  it('window:close → hide() 而非销毁, 并隐藏内容区视图', () => {
    const { window: getWin, view: getView, controller, closeHandler } = createWithCloseHandler();
    const win = getWin();
    const view = getView();

    closeHandler();
    expect(win.hidden).toBe(true);
    expect(win.destroyed).toBe(false); // 隐藏不销毁 (§6.4)
    expect(view.visible).toBe(false);
    expect(controller).toBeDefined();
  });

  it('restore() 瞬时恢复: 显示 + 前置聚焦 + 内容区重新可见', () => {
    const { window: getWin, view: getView, controller } = createWithCloseHandler();
    const win = getWin();
    const view = getView();

    closeToTray(controller);
    controller.show();
    expect(win.shown).toBe(true);
    expect(win.focused).toBe(true);
    expect(view.visible).toBe(true);
  });

  it('loadDshUrl 把内容区指向新地址 (服务就绪后调用)', () => {
    const { view: getView, controller } = createWithCloseHandler();
    const view = getView();
    controller.loadDshUrl('http://127.0.0.1:52130');
    expect(view.webContents.loadURL).toHaveBeenCalledWith('http://127.0.0.1:52130');
  });

  it('getState 返回窗口状态 (最大化/聚焦/可见)', () => {
    const { window: getWin, ipc, closeHandler } = createWithCloseHandler();
    const win = getWin();
    const getState = ipc.handlers.get(windowChannels.getState);

    expect(win.hidden).toBe(true);
    const before = (getState as () => unknown)();
    expect(before).toEqual({ maximized: false, focused: false, visible: false });

    closeHandler();
    closeHandler(); // 幂等
    win.focused = true;
    expect((getState as () => unknown)()).toEqual({
      maximized: false,
      focused: true,
      visible: false,
    });
  });

  it('dispose 移除全部窗口 IPC 处理器', () => {
    const { ipc, controller } = createWithCloseHandler();
    controller.dispose();
    for (const channel of Object.values(windowChannels)) {
      expect(ipc.handlers.has(channel)).toBe(false);
    }
    expect(ipc.removeHandler.mock.calls.length).toBe(Object.values(windowChannels).length);
  });
});

/** 触发一次 window:close 隐藏到托盘 (复用 createWithCloseHandler 的断言路径) */
function closeToTray(controller: DshWindowController): void {
  controller.hide();
}

/* ------------------------------------------------------------------ */
/* DWM 圆角 / 身份标识 / DPI                                           */
/* ------------------------------------------------------------------ */

describe('DWM 圆角开关 (Win11 专属)', () => {
  beforeEach(() => {
    FakeBrowserWindow.instances = [];
    FakeWebContentsView.instances = [];
  });

  it('Win32 + build ≥ 22000: 以窗口 HWND 调用注入的圆角 setter', () => {
    const setCornerPreference = vi.fn(() => 0);
    const { deps, window: getWin } = makeDeps({ setCornerPreference });
    createWindowController(deps);
    const hwnd = getWin().getNativeWindowHandle();
    expect(setCornerPreference).toHaveBeenCalledTimes(1);
    expect(setCornerPreference).toHaveBeenCalledWith(hwnd);
  });

  it('Win32 + build < 22000 (Win10): 不调用圆角 setter', () => {
    const setCornerPreference = vi.fn(() => 0);
    const { deps } = makeDeps({ release: '10.0.19045', setCornerPreference });
    createWindowController(deps);
    expect(setCornerPreference).not.toHaveBeenCalled();
  });

  it('非 Windows 平台: 即使 build 达标也不调用圆角 setter', () => {
    const setCornerPreference = vi.fn(() => 0);
    const { deps } = makeDeps({ platform: 'darwin', setCornerPreference });
    createWindowController(deps);
    expect(setCornerPreference).not.toHaveBeenCalled();
  });
});

describe('身份标识与 DPI', () => {
  it('Windows 下写入 AppUserModelId (通知标识)', () => {
    const { app } = makeDeps();
    configureAppIdentity(app, { platform: 'win32' });
    expect(app.setAppUserModelId).toHaveBeenCalledWith(APP_USER_MODEL_ID);
  });

  it('非 Windows 平台不写入 AppUserModelId', () => {
    const { app } = makeDeps();
    configureAppIdentity(app, { platform: 'linux' });
    expect(app.setAppUserModelId).not.toHaveBeenCalled();
  });

  it('Windows 下开启 Per-Monitor v2 DPI 开关 (high-dpi-support)', () => {
    const { commandLine } = makeDeps();
    enablePerMonitorV2({ commandLine }, { platform: 'win32' });
    expect(commandLine.appendSwitch).toHaveBeenCalledWith('high-dpi-support', '1');
  });

  it('非 Windows 平台跳过 DPI 开关', () => {
    const { commandLine } = makeDeps();
    enablePerMonitorV2({ commandLine }, { platform: 'darwin' });
    expect(commandLine.appendSwitch).not.toHaveBeenCalled();
  });
});
