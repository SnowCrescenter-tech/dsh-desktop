/**
 * dsh-desktop 无边框窗口控制器 (主进程) —— 设计规范 §3。
 *
 * 职责:
 *   - 无边框 BrowserWindow (frame:false, titleBarStyle:'hidden'), 最小 800×560,
 *     默认 1080×720, 背景色取设计令牌 (浅色 #F4F6F9), show:false + ready-to-show
 *     后再显示 (杜绝白闪);
 *   - Win11 (build ≥ 22000) 下通过 DWM DWMWA_WINDOW_CORNER_PREFERENCE=DWMWCP_ROUND
 *     开启原生窗口圆角, Win10 保持系统方角 (winver.ts / dwm.ts);
 *   - 布局: 窗口自身 webContents 渲染 36px 不透明标题栏 (dist/renderer 产物),
 *     其下方挂单个 WebContentsView 承载 dsh Web UI —— 全生命周期一个实例,
 *     隐藏不销毁 (§6.4);
 *   - 标题栏关闭钮 (IPC window:close) → hide() 隐藏到托盘 (§3.3);
 *     restore() 瞬时恢复; 窗口最小化/最大化/还原/状态查询同样走 window:* 通道;
 *   - Windows 通知所需 AppUserModelId (app.setAppUserModelId)。
 *
 * 依赖 (BrowserWindow / WebContentsView / ipcMain / app) 全部可注入,
 * 便于 vitest 用 mock 驱动; 生产环境默认取 electron 模块的真实实现。
 * 标题栏 UI 本体由 T10 实现, 本文件只负责窗口框架与布局。
 */
import {
  BrowserWindow,
  ipcMain,
  shell,
  WebContentsView,
} from 'electron';
import type {
  BrowserWindowConstructorOptions,
  IpcMain,
  Rectangle,
} from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  windowChannels,
  type WindowState,
} from '../shared/contract.js';
import {
  window as windowLayout,
  windowBackgroundColor,
} from '../shared/tokens.js';
import {
  createCornerPreferenceSetter,
  loadKoffi,
  type CornerPreferenceSetter,
} from './dwm.js';
import { shouldRoundCorners } from './winver.js';

/** Windows 通知 / 托盘标识 (app.setAppUserModelId) */
export const APP_USER_MODEL_ID = 'com.dsh.desktop';

/** 内容区 WebContentsView 的默认承载地址 (服务就绪后由 loadDshUrl 替换) */
export const DEFAULT_DSH_URL = 'about:blank';

/** 主进程模块所在目录 (prod: dist/main; 由此定位 renderer / preload 产物) */
const appDir = dirname(fileURLToPath(import.meta.url));

/** 最小化注入面: app.setAppUserModelId (Windows 通知标识) */
export interface AppIdentityLike {
  setAppUserModelId(id: string): void;
}

/** 最小化注入面: app.commandLine (Per-Monitor v2 DPI 开关) */
export interface CommandLineLike {
  appendSwitch(name: string, value?: string): void;
}

/** 控制器可注入依赖 */
export interface WindowControllerDeps {
  /** 当前平台, 默认 process.platform */
  platform?: NodeJS.Platform;
  /** os.release() 返回值, 默认 node:os release() (用于 Win11 判定) */
  release?: string;
  /** 主进程 app; 提供时写入 AppUserModelId (Windows) */
  app?: AppIdentityLike;
  /** BrowserWindow 构造器, 默认 electron.BrowserWindow */
  BrowserWindow?: typeof BrowserWindow;
  /** WebContentsView 构造器, 默认 electron.WebContentsView */
  WebContentsView?: typeof WebContentsView;
  /** ipcMain 处理器注册面, 默认 electron.ipcMain */
  ipcMain?: Pick<IpcMain, 'handle' | 'removeHandler'>;
  /** DWM 圆角 setter; 测试注入, 默认经 koffi 绑定 */
  setCornerPreference?: CornerPreferenceSetter;
  /** 内容区 (WebContentsView) 初始地址, 默认 about:blank */
  dshUrl?: string;
  /** 标题栏 renderer 的 dev server 地址, 默认读 ELECTRON_RENDERER_URL */
  rendererDevUrl?: string;
}

/** 窗口控制器对外 API */
export interface DshWindowController {
  /** 主窗口原生实例 (引导对话框等需要 parent 的场景使用) */
  getWindow(): BrowserWindow;
  /** 恢复显示: 瞬时展示 + 前置聚焦 (托盘"打开主界面"入口) */
  show(): void;
  /** 隐藏到托盘: 只隐藏不销毁 (标题栏关闭钮) */
  hide(): void;
  /** 把 dsh Web UI 指向新地址 (服务就绪后调用) */
  loadDshUrl(url: string): void;
  /** 释放: 移除本控制器注册的全部 IPC 处理器 */
  dispose(): void;
}

/**
 * 主窗口构造选项 —— 无边框 + 设计令牌尺寸/底色 + 隐藏启动。
 * 纯函数, 便于断言。
 */
export function buildWindowOptions(dark = false): BrowserWindowConstructorOptions {
  return {
    width: windowLayout.defaultWidth,
    height: windowLayout.defaultHeight,
    minWidth: windowLayout.minWidth,
    minHeight: windowLayout.minHeight,
    frame: false, // 无边框, 标题栏由渲染层自绘 (§3.1)
    titleBarStyle: 'hidden',
    show: false, // ready-to-show 后才显示, 杜绝白闪
    autoHideMenuBar: true,
    backgroundColor: windowBackgroundColor(dark), // 浅色 #F4F6F9
    webPreferences: {
      preload: join(appDir, '../preload/index.mjs'),
      // ESM preload 要求关闭 sandbox (electron-vite ESM 模板约定)
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  };
}

/**
 * 内容区矩形: 36px 标题栏下方的整个剩余区域。
 * 窗口缩放时据此重排 WebContentsView。
 */
export function layoutContentArea(width: number, height: number): Rectangle {
  const titleBarHeight = windowLayout.titleBarHeight;
  return {
    x: 0,
    y: titleBarHeight,
    width,
    height: Math.max(0, height - titleBarHeight),
  };
}

/** 写入 Windows 通知所需的 AppUserModelId (仅 Win32 生效) */
export function configureAppIdentity(
  app: AppIdentityLike,
  deps: WindowControllerDeps = {},
): void {
  if ((deps.platform ?? process.platform) === 'win32') {
    app.setAppUserModelId(APP_USER_MODEL_ID);
  }
}

/**
 * Per-Monitor v2 DPI 感知 (设计规范 §3.3): 在 app ready 之前追加
 * 高 DPI 开关。PerMonitorV2 声明同时由打包 manifest 承担 (electron-builder
 * 打包阶段, 超出本任务范围)。
 */
export function enablePerMonitorV2(
  app: { commandLine: CommandLineLike },
  deps: WindowControllerDeps = {},
): void {
  if ((deps.platform ?? process.platform) === 'win32') {
    app.commandLine.appendSwitch('high-dpi-support', '1');
  }
}

/** 创建窗口控制器 (主窗口 + 内容区视图 + 窗口 IPC) */
export function createWindowController(
  deps: WindowControllerDeps = {},
): DshWindowController {
  const BrowserWindowCtor = deps.BrowserWindow ?? BrowserWindow;
  const WebContentsViewCtor = deps.WebContentsView ?? WebContentsView;
  const ipc = deps.ipcMain ?? ipcMain;

  // 1) 无边框主窗口: 窗口自身 webContents 即标题栏渲染层
  const win = new BrowserWindowCtor(buildWindowOptions());

  if (deps.app !== undefined) {
    configureAppIdentity(deps.app, deps);
  }

  win.on('ready-to-show', () => {
    if (!win.isDestroyed()) {
      win.show();
    }
  });

  // 外部链接一律交给系统浏览器, 避免在应用窗口内打开
  win.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // 2) Win11 下启用 DWM 原生圆角 (Win10 跳过, 保持方角)
  applyRoundedCornersIfSupported(win, deps);

  // 3) 标题栏: 加载 renderer 产物 (dev 走 dev server, prod 走 dist/renderer)
  const devServerUrl = deps.rendererDevUrl ?? process.env['ELECTRON_RENDERER_URL'];
  if (devServerUrl) {
    void win.loadURL(devServerUrl);
  } else {
    void win.loadFile(join(appDir, '../renderer/index.html'));
  }

  // 4) 内容区: 标题栏下方的单个 WebContentsView (全生命周期一个实例, §6.4)
  const view = new WebContentsViewCtor({
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.contentView.addChildView(view);

  const relayout = (): void => {
    const [width = 0, height = 0] = win.getContentSize();
    view.setBounds(layoutContentArea(width, height));
  };
  win.on('resize', relayout);
  win.on('resized', relayout);
  relayout();

  void view.webContents.loadURL(deps.dshUrl ?? DEFAULT_DSH_URL);

  // 5) 标题栏 IPC: window:* 通道 (契约 src/shared/contract.ts)
  ipc.handle(windowChannels.minimize, () => {
    win.minimize();
  });
  ipc.handle(windowChannels.maximize, () => {
    win.maximize();
  });
  ipc.handle(windowChannels.unmaximize, () => {
    win.unmaximize();
  });
  ipc.handle(windowChannels.close, () => {
    hide();
  });
  ipc.handle(windowChannels.getState, () => getWindowState());

  function show(): void {
    if (win.isDestroyed()) {
      return;
    }
    relayout();
    view.setVisible(true);
    win.show();
    win.focus();
  }

  function hide(): void {
    if (win.isDestroyed()) {
      return;
    }
    view.setVisible(false);
    win.hide();
  }

  function getWindowState(): WindowState {
    return {
      maximized: win.isMaximized(),
      focused: win.isFocused(),
      visible: !win.isDestroyed() && win.isVisible(),
    };
  }

  function dispose(): void {
    for (const channel of Object.values(windowChannels)) {
      ipc.removeHandler(channel);
    }
  }

  return { getWindow, show, hide, loadDshUrl, dispose };

  function getWindow(): BrowserWindow {
    return win;
  }

  function loadDshUrl(url: string): void {
    if (!win.isDestroyed()) {
      void view.webContents.loadURL(url);
    }
  }
}

/** 按平台与 build 号决定是否应用 DWM 圆角 (注入 setter 时同步执行) */
function applyRoundedCornersIfSupported(
  win: BrowserWindow,
  deps: WindowControllerDeps,
): void {
  if (!shouldRoundCorners({ platform: deps.platform, release: deps.release })) {
    return;
  }
  const hwnd = win.getNativeWindowHandle();
  if (deps.setCornerPreference !== undefined) {
    deps.setCornerPreference(hwnd);
    return;
  }
  // 生产路径: koffi 为可选依赖, 缺失时优雅降级 (圆角仅外观)
  const koffi = loadKoffi();
  if (koffi === null) {
    return;
  }
  const setter = createCornerPreferenceSetter(koffi);
  if (setter !== null) {
    setter(hwnd);
  }
}
