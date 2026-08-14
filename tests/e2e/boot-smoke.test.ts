/**
 * E2E boot-smoke (Wave 3 T16): 无头启动构建产物 dist/main/index.js, 断言应用健康状态。
 *
 * 方法: 不引入 Playwright —— 用 vitest (node 环境) 直接 import 构建产物,
 * 仅在 electron 边界注入假实现 (无 GUI, 见 electron-mock.ts), 其余模块
 * (组合根 / first-run / process-handle / state-machine / profile / window /
 * tray …) 全部真实执行:
 *   - 顶层 requestSingleInstanceLock → 断言单实例锁语义 (获取 → bootstrap;
 *     拿不到 → app.exit);
 *   - BrowserWindow 构造 → 断言窗口创建;
 *   - first-run 经真实 spawnDsh 拉起"假 dsh CLI"(临时 node 脚本, 打印
 *     `dsh web: http://127.0.0.1:8123` 后保持存活), 状态机解析就绪行;
 *   - 断言 running 状态与解析出的端口 8123 (loadDshUrl 的目标 URL);
 *   - 强杀假 dsh 进程 → 状态机 exited → 状态 error (完整启动序列收尾)。
 *
 * 前置条件: dist/main/index.js 存在 (npm run build 已产出)。
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { electronMock } from './electron-mock.js';

// 在 electron 边界注入假实现 —— 构建产物里 `import ... from "electron"` 全部落到这里
vi.mock('electron', async () => {
  const { electronMock: mock } = await import('./electron-mock.js');
  return mock;
});

// electron-updater 整模块 mock: 真实 NsisUpdater 构造需要 electron app 的
// getVersion/isPackaged 等运行时能力, 无头 e2e 不构造真实 updater。组合根对该
// 实例只做属性写入 (logger/autoDownload) 与事件订阅, plain object 足够;
// 便携分支 (无 app-update.yml) 下 check() 不调用 checkForUpdates, 无需行为。
vi.mock('electron-updater', () => ({
  autoUpdater: {
    autoDownload: false,
    autoInstallOnAppQuit: true,
    logger: null,
    on(_event: string, _listener: unknown): void {},
    checkForUpdates(): Promise<null> {
      return Promise.resolve(null);
    },
    quitAndInstall(): void {},
  },
}));

/** 构建产物绝对路径 (仅用于存在性检查与报错提示) */
const BUNDLE_ABS_PATH = join(import.meta.dirname, '..', '..', 'dist', 'main', 'index.js');

/**
 * 构建产物动态 import URL (file:// URL)。
 * 必须用「变量」而非字面量: 字面量 import('../../dist/main/index.js') 会被
 * 类型检查器静态解析, CI 干净 checkout (尚无 dist/) 会报 TS2307;
 * 变量形式运行时行为不变 (vitest 直接加载构建产物), 但类型检查不再解析模块。
 */
const BUNDLE_URL = pathToFileURL(BUNDLE_ABS_PATH).href;

/**
 * 假 dsh CLI 脚本: 把自身 pid 写入 cwd (spawn 的 cwd = DSH_HOME), 打印就绪行后
 * 保持存活 —— 让状态机解析到 `dsh web: http://127.0.0.1:8123` 且进程不退出。
 */
const FAKE_DSH_BIN_JS = [
  "// 假 dsh CLI: 打印就绪行后保持存活 (e2e boot-smoke 专用)",
  "const { writeFileSync } = require('node:fs');",
  "const { join } = require('node:path');",
  "writeFileSync(join(process.cwd(), 'fake-dsh.pid'), String(process.pid));",
  "console.log('dsh web: http://127.0.0.1:8123');",
  "setInterval(() => {}, 1 << 30);",
].join('\n');

/** 测试共用目录: 每个用例独立的 app 目录 (假 dsh CLI/插件) 与 DSH_HOME */
const tmpRoot = mkdtempSync(join(tmpdir(), 'dsh-e2e-'));
let appPath = '';
let dshHome = '';
let seq = 0;

/** 在临时 app 目录里铺出组合根解析所需的最小文件树 (假 dsh CLI + 假客户端插件) */
function prepareAppDir(dir: string): void {
  const dshLibDir = join(dir, 'node_modules', '@deepseek-ai', 'dsh', 'lib');
  mkdirSync(dshLibDir, { recursive: true });
  writeFileSync(join(dshLibDir, 'bin.js'), FAKE_DSH_BIN_JS, 'utf8');

  const pluginRoot = join(dir, 'packages', '@dsh-desktop', 'client');
  mkdirSync(join(pluginRoot, 'lib'), { recursive: true });
  writeFileSync(join(pluginRoot, 'lib', 'index.js'), '// 假客户端插件入口\n', 'utf8');
  writeFileSync(
    join(pluginRoot, 'package.json'),
    `${JSON.stringify({ name: '@dsh-desktop/client', version: '0.0.0', main: 'lib/index.js' }, null, 2)}\n`,
    'utf8',
  );
}

/** 无头启动构建产物: 重置 mock → 注入环境 → 重新 import dist/main/index.js (顶层执行组合根) */
async function bootApp(lockResult: boolean): Promise<void> {
  if (!existsSync(BUNDLE_ABS_PATH)) {
    throw new Error(`构建产物不存在: ${BUNDLE_ABS_PATH} —— 请先执行 npm run build`);
  }
  electronMock.reset();
  electronMock.state.lockResult = lockResult;
  electronMock.state.appPath = appPath;
  process.env['DSH_HOME'] = dshHome;
  process.env['DEEPSEEK_API_KEY'] = 'sk-e2e-boot-smoke';
  vi.resetModules();
  await import(BUNDLE_URL);
}

/** 触发 app.whenReady 回调 —— bootstrap 内的完整装配流程由此开始 */
function resolveWhenReady(): void {
  const resolve = electronMock.state.whenReadyResolvers.pop();
  if (resolve === undefined) {
    throw new Error('app.whenReady 未被调用');
  }
  resolve();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** 从状态负载里提取 running 状态 (无匹配返回 null) */
function toRunningStatus(status: unknown): { phase: 'running'; url: string } | null {
  if (!isRecord(status)) {
    return null;
  }
  if (status['phase'] !== 'running') {
    return null;
  }
  const url = status['url'];
  if (typeof url !== 'string') {
    return null;
  }
  return { phase: 'running', url };
}

/** 从状态负载里提取 error 状态 (无匹配返回 null) */
function toErrorStatus(status: unknown): { phase: 'error'; message: string } | null {
  if (!isRecord(status)) {
    return null;
  }
  if (status['phase'] !== 'error') {
    return null;
  }
  const message = status['message'];
  if (typeof message !== 'string') {
    return null;
  }
  return { phase: 'error', message };
}

/** 轮询直到出现 running 状态上报, 返回该状态 */
async function waitForRunning(): Promise<{ phase: 'running'; url: string }> {
  await vi.waitFor(
    () => {
      expect(electronMock.state.sentStatuses.some((s) => toRunningStatus(s) !== null)).toBe(true);
    },
    { timeout: 15_000, interval: 25 },
  );
  const found = electronMock.state.sentStatuses
    .map(toRunningStatus)
    .find((s): s is { phase: 'running'; url: string } => s !== null);
  if (found === undefined) {
    throw new Error('缺少 running 状态上报');
  }
  return found;
}

/** 轮询直到出现 error 状态上报, 返回该状态 */
async function waitForError(): Promise<{ phase: 'error'; message: string }> {
  await vi.waitFor(
    () => {
      expect(electronMock.state.sentStatuses.some((s) => toErrorStatus(s) !== null)).toBe(true);
    },
    { timeout: 5_000, interval: 25 },
  );
  const found = electronMock.state.sentStatuses
    .map(toErrorStatus)
    .find((s): s is { phase: 'error'; message: string } => s !== null);
  if (found === undefined) {
    throw new Error('缺少 error 状态上报');
  }
  return found;
}

/** 等假 dsh 子进程真正退出 (before-quit 里的 firstRun.stop() 是异步的) */
async function waitForFakeDshExit(): Promise<void> {
  let pid: number;
  try {
    pid = Number(readFileSync(join(dshHome, 'fake-dsh.pid'), 'utf8'));
  } catch {
    return; // 从未拉起子进程
  }
  if (!Number.isInteger(pid)) {
    return;
  }
  const deadline = Date.now() + 5_000;
  for (;;) {
    try {
      process.kill(pid, 0);
    } catch {
      return; // 进程已不存在
    }
    if (Date.now() > deadline) {
      return; // 兜底: 不再等待 (killDsh 的 taskkill 树杀已保证终止)
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe('e2e boot-smoke: 构建产物无头启动', () => {
  beforeEach(() => {
    appPath = join(tmpRoot, `app-${seq}`);
    dshHome = join(tmpRoot, `home-${seq}`);
    seq += 1;
    mkdirSync(dshHome, { recursive: true });
    prepareAppDir(appPath);
  });

  afterEach(async () => {
    // 触发组合根 before-quit: firstRun.stop() → killDsh (SIGTERM + taskkill /T /F)
    for (const listener of electronMock.state.appListeners['before-quit'] ?? []) {
      listener();
    }
    await waitForFakeDshExit();
    vi.resetModules();
    delete process.env['DSH_HOME'];
    delete process.env['DEEPSEEK_API_KEY'];
  });

  afterAll(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('单实例锁获取 → 窗口创建 → 运行时就绪 (解析端口 8123)', async () => {
    await bootApp(true);

    // 拿到单实例锁 → 进入 bootstrap (未走第二实例的 app.exit 路径)
    expect(electronMock.state.exitCalls).toBe(0);

    resolveWhenReady();

    // 状态机经 ready 到达 running: URL 解析自就绪行 `dsh web: http://127.0.0.1:8123`
    const running = await waitForRunning();
    expect(running).toEqual({ phase: 'running', url: 'http://127.0.0.1:8123' });

    // 窗口与内容区视图、托盘均已创建 (bootstrap 装配完成)
    expect(electronMock.state.browserWindowCalls).toBeGreaterThanOrEqual(1);
    expect(electronMock.state.viewCalls).toBeGreaterThanOrEqual(1);
    expect(electronMock.state.trayCalls).toBeGreaterThanOrEqual(1);

    // 内容区 WebContentsView 已指向解析出的服务地址 (端口 8123)
    await vi.waitFor(
      () => {
        expect(electronMock.state.loadedUrls.some((url) => url === 'http://127.0.0.1:8123')).toBe(
          true,
        );
      },
      { timeout: 5_000, interval: 25 },
    );
  });

  it('第二实例: 拿不到单实例锁 → 直接 exit, 不进入启动流程', async () => {
    await bootApp(false);

    expect(electronMock.state.exitCalls).toBe(1);
    expect(electronMock.state.whenReadyResolvers).toHaveLength(0);
    expect(electronMock.state.browserWindowCalls).toBe(0);
  });

  it('运行时就绪后假 dsh 进程退出 → 状态 error (完整启动序列收尾)', async () => {
    await bootApp(true);
    resolveWhenReady();
    await waitForRunning();

    // 从 pid 文件拿到假 dsh 子进程并强制终止 (模拟服务崩溃/退出)
    const pid = Number(readFileSync(join(dshHome, 'fake-dsh.pid'), 'utf8'));
    expect(Number.isInteger(pid)).toBe(true);
    process.kill(pid);

    const error = await waitForError();
    expect(error.message).toContain('本地服务已退出');
  });
});
