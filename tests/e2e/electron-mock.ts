/**
 * electron 模块的假实现 (e2e boot-smoke 专用)。
 *
 * 只模拟 dsh-desktop 主进程构建产物实际用到的 electron 成员; 所有"副作用"
 * 统一收敛进 state, 供 boot-smoke 测试断言启动序列。独立成模块以便复用,
 * 由 boot-smoke.test.ts 通过 vi.mock('electron', ...) 注入。
 *
 * 注意: 测试会在每个用例前 vi.resetModules(), 而 vi.mock 的异步工厂会再次
 * import 本模块 —— 因此 state 挂在 globalThis 上共享, 保证任何模块实例
 * (测试文件的静态 import 与工厂的动态 import) 读写的是同一份状态。
 */

/** electron mock 的可变状态 (测试据此断言启动序列) */
export interface MockState {
  /** requestSingleInstanceLock 的返回值 */
  lockResult: boolean;
  /** app.getAppPath() 的返回值 (指向临时 app 目录) */
  appPath: string;
  /** 挂起的 whenReady 解析器 (import 时注册, 测试主动 resolve) */
  whenReadyResolvers: Array<() => void>;
  /** app.on 注册的监听器, 按事件名分桶 */
  appListeners: Record<string, Array<() => void>>;
  browserWindowCalls: number;
  viewCalls: number;
  trayCalls: number;
  exitCalls: number;
  /** win.webContents.send 收到的全部状态负载 (ServiceStatus) */
  sentStatuses: unknown[];
  /** 内容区 WebContentsView.webContents.loadURL 的全部目标 URL */
  loadedUrls: string[];
}

/** 构造一份全新的 mock 状态 */
function createMockState(): MockState {
  return {
    lockResult: true,
    appPath: '',
    whenReadyResolvers: [],
    appListeners: {},
    browserWindowCalls: 0,
    viewCalls: 0,
    trayCalls: 0,
    exitCalls: 0,
    sentStatuses: [],
    loadedUrls: [],
  };
}

/** 全局共享状态的挂载点 (跨模块实例共享, 见文件头注释) */
interface GlobalMockHolder {
  __dshE2eElectronMockState?: MockState;
}

/** 取全局共享的 mock 状态 (首次创建后缓存到 globalThis) */
function getSharedState(): MockState {
  const holder = globalThis as GlobalMockHolder;
  const existing = holder.__dshE2eElectronMockState;
  if (existing !== undefined) {
    return existing;
  }
  const fresh = createMockState();
  holder.__dshE2eElectronMockState = fresh;
  return fresh;
}

const state = getSharedState();

/** 重置全部 mock 状态 (每个测试用例开始前调用) */
function reset(): void {
  state.lockResult = true;
  state.appPath = '';
  state.whenReadyResolvers.length = 0;
  for (const key of Object.keys(state.appListeners)) {
    delete state.appListeners[key];
  }
  state.browserWindowCalls = 0;
  state.viewCalls = 0;
  state.trayCalls = 0;
  state.exitCalls = 0;
  state.sentStatuses.length = 0;
  state.loadedUrls.length = 0;
}

/** 预置的内容区视图: 带 webContents (on/loadURL), 供 ipc.ts 的 findDshWebContents 定位 */
function makeView(): {
  webContents: {
    on(_event: string, _listener: () => void): void;
    loadURL(_url: string): void;
  };
} {
  return {
    webContents: {
      on(_event: string, _listener: () => void): void {},
      loadURL(_url: string): void {},
    },
  };
}

class MockBrowserWindow {
  webContents: {
    setWindowOpenHandler(handler: unknown): void;
    send(channel: string, payload: unknown): void;
  } = {
    setWindowOpenHandler(_handler: unknown): void {},
    send(_channel: string, payload: unknown): void {
      state.sentStatuses.push(payload);
    },
  };
  contentView: {
    children: unknown[];
    addChildView(child: unknown): void;
  } = {
    children: [makeView()],
    addChildView(_child: unknown): void {},
  };
  constructor(_options: unknown) {
    state.browserWindowCalls += 1;
  }
  on(_event: string, _listener: () => void): void {}
  once(_event: string, _listener: () => void): void {}
  getContentSize(): [number, number] {
    return [1080, 720];
  }
  isDestroyed(): boolean {
    return false;
  }
  show(): void {}
  hide(): void {}
  focus(): void {}
  minimize(): void {}
  maximize(): void {}
  unmaximize(): void {}
  isMaximized(): boolean {
    return false;
  }
  isFocused(): boolean {
    return true;
  }
  isVisible(): boolean {
    return true;
  }
  getNativeWindowHandle(): Buffer {
    return Buffer.from([0, 0, 0, 0, 0, 0, 0, 0]);
  }
  loadFile(_url: string): void {}
  loadURL(_url: string): void {}
}

class MockWebContentsView {
  webContents: {
    loadURL(url: string): void;
    on(event: string, listener: () => void): void;
  } = {
    loadURL(url: string): void {
      state.loadedUrls.push(url);
    },
    on(_event: string, _listener: () => void): void {},
  };
  constructor(_options: unknown) {
    state.viewCalls += 1;
  }
  setBounds(_rect: unknown): void {}
  setVisible(_visible: boolean): void {}
}

class MockTray {
  constructor(_imagePath: string) {
    state.trayCalls += 1;
  }
  setToolTip(_tip: string): void {}
  on(_event: string, _listener: () => void): void {}
  setContextMenu(_menu: unknown): void {}
  destroy(): void {}
}

class MockNotification {
  static isSupported(): boolean {
    return false;
  }
  constructor(_options: unknown) {}
  show(): void {}
}

/**
 * electron 模块的假实现 —— 只模拟组合根实际用到的成员。
 * 由 boot-smoke.test.ts 的 vi.mock('electron', ...) 注入到构建产物。
 */
export const electronMock = {
  state,
  reset,
  app: {
    commandLine: {
      appendSwitch(_name: string, _value?: string): void {},
    },
    requestSingleInstanceLock(): boolean {
      return state.lockResult;
    },
    on(event: string, listener: () => void): void {
      (state.appListeners[event] ??= []).push(listener);
    },
    whenReady(): Promise<void> {
      return new Promise((resolve) => {
        state.whenReadyResolvers.push(resolve);
      });
    },
    getAppPath(): string {
      return state.appPath;
    },
    setAppUserModelId(_id: string): void {},
    exit(_code: number): void {
      state.exitCalls += 1;
    },
    isReady(): boolean {
      return true;
    },
  },
  BrowserWindow: MockBrowserWindow,
  WebContentsView: MockWebContentsView,
  ipcMain: {
    handle(_channel: string, _handler: unknown): void {},
    removeHandler(_channel: string): void {},
  },
  shell: {
    openExternal(_url: string): Promise<void> {
      return Promise.resolve();
    },
  },
  Tray: MockTray,
  Menu: {
    buildFromTemplate(_template: unknown): unknown {
      return {};
    },
  },
  Notification: MockNotification,
  nativeTheme: { shouldUseDarkColors: false },
};

/** electronMock 的结构类型 (供测试文件引用) */
export type ElectronMock = typeof electronMock;
