/**
 * 自动更新模块单元测试 —— 结果映射 + 安装版/便携版分支 + 事件面 (T18)。
 *
 * 方法: electron-updater 整模块 mock (单测不联网), createUpdater 的全部依赖
 * (autoUpdater / notifier / shell / logger / isInstaller) 注入 plain-object fake,
 * 用事件发射 (fake.emit) 驱动 electron-updater 的事件面, 断言"事件 → 行为"映射。
 *
 * 守护的不变量:
 *   - 安装版: 无更新 → up-to-date; 有更新 → 后台下载 → ready + "重启后自动更新";
 *   - 便携版: 不调用 electron-updater, 手动检查通知 + 打开 Releases 页;
 *   - 无发布配置 / 离线 → not-available, 永不崩溃;
 *   - 就绪通知在静默检查下也必须弹出 (核心用户提醒);
 *   - quitAndInstall 仅在 ready 状态下生效。
 */
import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import type { UpdateCheckResult, UpdateInfo } from 'electron-updater';

import type { Notifier } from '../notifications.js';
import {
  createUpdateLogger,
  createUpdater,
  type UpdatePhase,
  type UpdaterLike,
} from '../update.js';

// electron-updater 整模块 mock: 单测只测 createUpdater 的编排逻辑,
// 不构造真实 AppUpdater (它需要 electron 运行时), 也不发起任何网络请求。
vi.mock('electron-updater', () => ({}));

/* ------------------------------------------------------------------ */
/* 可注入 fake 对象                                                     */
/* ------------------------------------------------------------------ */

type Listener = (...args: unknown[]) => void;

/** 事件可发射的 fake autoUpdater (记录订阅事件, 测试可手动派发事件) */
interface FakeUpdater extends Omit<UpdaterLike, 'checkForUpdates' | 'quitAndInstall'> {
  checkForUpdates: Mock<() => Promise<UpdateCheckResult | null>>;
  quitAndInstall: Mock<() => void>;
  emit(event: string, ...args: unknown[]): void;
  onCalls: Array<{ event: string }>;
}

function createFakeUpdater(): FakeUpdater {
  const listeners = new Map<string, Listener[]>();
  const onCalls: Array<{ event: string }> = [];
  const fake: FakeUpdater = {
    autoDownload: false,
    autoInstallOnAppQuit: true,
    logger: null,
    onCalls,
    // UpdaterLike.on 是重载 (typed listener); fake 统一收纳为 unknown 参数监听器,
    // 事件发射侧再分发 (参数由测试显式传入, 运行时类型始终正确 —— 测试边界的窄化)。
    on(event: string, listener: (...args: never[]) => void) {
      onCalls.push({ event });
      const set = listeners.get(event) ?? [];
      set.push(listener as Listener);
      listeners.set(event, set);
    },
    emit(event, ...args) {
      for (const listener of listeners.get(event) ?? []) {
        listener(...args);
      }
    },
    checkForUpdates: vi.fn(async (): Promise<UpdateCheckResult | null> => null),
    quitAndInstall: vi.fn<() => void>(),
  };
  return fake;
}

function createFakeNotifier(): { notifier: Notifier; calls: Array<{ title: string; body: string }> } {
  const calls: Array<{ title: string; body: string }> = [];
  return {
    calls,
    notifier: {
      notify(options) {
        calls.push(options);
      },
    },
  };
}

function createFakeLogger(): {
  debug: Mock<(message: string) => void>;
  info: Mock<(message?: unknown) => void>;
  warn: Mock<(message?: unknown) => void>;
  error: Mock<(message?: unknown) => void>;
} {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

/** 构造最小合法的 UpdateCheckResult (填齐 builder-util-runtime 的必填字段) */
function makeUpdateCheckResult(
  version: string,
  downloadPromise: Promise<Array<string>> | null = null,
): UpdateCheckResult {
  const updateInfo: UpdateInfo = {
    version,
    files: [],
    path: '',
    sha512: '',
    releaseDate: '2026-01-01T00:00:00.000Z',
  };
  return { isUpdateAvailable: true, updateInfo, versionInfo: updateInfo, downloadPromise };
}

/** 标准装配: fake autoUpdater + 记录型 notifier/logger + vi.fn shell */
function setup(options: { isInstaller?: boolean } = {}): {
  fake: FakeUpdater;
  notifier: { calls: Array<{ title: string; body: string }> };
  logger: ReturnType<typeof createFakeLogger>;
  openExternal: ReturnType<typeof vi.fn>;
  updater: ReturnType<typeof createUpdater>;
} {
  const fake = createFakeUpdater();
  const notifier = createFakeNotifier();
  const logger = createFakeLogger();
  const openExternal = vi.fn(async (_url: string): Promise<void> => {});
  const isInstaller = options.isInstaller ?? true;
  const updater = createUpdater({
    autoUpdater: fake,
    notifier: notifier.notifier,
    shell: { openExternal },
    logger,
    isInstaller: () => isInstaller,
    releasesUrl: 'https://github.com/SnowCrescenter-tech/dsh-desktop/releases',
  });
  // 安装版默认自动下载; 测试里显式断言该开关的行为
  if (!isInstaller) {
    expect(fake.autoDownload).toBe(false);
  } else {
    expect(fake.autoDownload).toBe(true);
  }
  return { fake, notifier, logger, openExternal, updater };
}

/* ------------------------------------------------------------------ */
/* 测试用例                                                             */
/* ------------------------------------------------------------------ */

describe('createUpdater — 事件面订阅与默认装配', () => {
  it('订阅 electron-updater 的完整事件面 (checking / available / not-available / progress / downloaded / error)', () => {
    const { fake } = setup();
    const events = fake.onCalls.map((call) => call.event).sort();
    expect(events).toEqual([
      'checking-for-update',
      'download-progress',
      'error',
      'update-available',
      'update-downloaded',
      'update-not-available',
    ]);
  });

  it('autoDownload 跟随安装形态; logger 接到 autoUpdater.logger', () => {
    const { fake, logger } = setup({ isInstaller: true });
    expect(fake.autoDownload).toBe(true);
    expect(fake.logger).toBe(logger);
    expect(fake.autoInstallOnAppQuit).toBe(true);

    // 便携版 → autoDownload=false (只检查不下载)
    const portableFake = createFakeUpdater();
    const notifier = createFakeNotifier();
    createUpdater({
      autoUpdater: portableFake,
      notifier: notifier.notifier,
      shell: { openExternal: vi.fn() },
      logger: createFakeLogger(),
      isInstaller: () => false,
      releasesUrl: 'https://github.com/SnowCrescenter-tech/dsh-desktop/releases',
    });
    expect(portableFake.autoDownload).toBe(false);
  });

  it('onPhaseChange 订阅阶段变化; 取消后不再触发', () => {
    const { fake, updater } = setup();
    const phases: UpdatePhase[] = [];
    const unsubscribe = updater.onPhaseChange((phase) => phases.push(phase));

    fake.emit('checking-for-update');
    expect(phases.at(-1)).toEqual({ phase: 'checking' });

    unsubscribe();
    fake.emit('update-downloaded', {});
    expect(phases).toHaveLength(1);
  });
});

describe('createUpdater — 安装版 (NSIS, isInstaller=true)', () => {
  it('已是最新 (checkForUpdates → null) → up-to-date; 手动检查弹"已是最新"通知', async () => {
    const { fake, notifier, updater } = setup({ isInstaller: true });
    fake.checkForUpdates.mockResolvedValue(null);

    const result = await updater.check();

    expect(result).toEqual({ status: 'up-to-date' });
    expect(updater.getPhase()).toEqual({ phase: 'up-to-date' });
    expect(notifier.calls).toContainEqual({ title: '检查更新', body: '当前已是最新版本' });
  });

  it('已是最新; 静默检查不弹任何通知', async () => {
    const { fake, notifier, updater } = setup({ isInstaller: true });
    fake.checkForUpdates.mockResolvedValue(null);

    const result = await updater.check({ silent: true });

    expect(result).toEqual({ status: 'up-to-date' });
    expect(notifier.calls).toHaveLength(0);
  });

  it('发现新版本 + 下载完成 → ready; 静默检查也弹"重启后自动更新"通知', async () => {
    const { fake, notifier, updater } = setup({ isInstaller: true });
    // 手动控制 downloadPromise: 模拟真实时序 —— check() 挂起在下载上,
    // 下载完成时 electron-updater 先派发 update-downloaded 事件, 再 resolve 下载
    let resolveDownload!: (paths: Array<string>) => void;
    const downloadPromise = new Promise<Array<string>>((resolve) => {
      resolveDownload = resolve;
    });
    fake.checkForUpdates.mockResolvedValue(makeUpdateCheckResult('0.3.0', downloadPromise));

    const checkPromise = updater.check({ silent: true });
    // 此时 check() 已挂起在 downloadPromise 上; 模拟下载完成事件
    fake.emit('update-downloaded', { version: '0.3.0', downloadedFile: 'C:\\x\\0.3.0.exe' });
    resolveDownload([]);
    const result = await checkPromise;

    expect(result).toEqual({ status: 'ready' });
    expect(updater.getPhase()).toEqual({ phase: 'ready' });
    // 就绪提醒是核心用户通知: 静默检查下也必须弹出
    expect(notifier.calls).toContainEqual({
      title: 'dsh-desktop 有新版本',
      body: '新版本已就绪，重启后自动更新',
    });
  });

  it('手动检查发现新版本 → 先弹"正在后台下载", 完成后弹"重启后自动更新"', async () => {
    const { fake, notifier, updater } = setup({ isInstaller: true });
    let resolveDownload!: (paths: Array<string>) => void;
    const downloadPromise = new Promise<Array<string>>((resolve) => {
      resolveDownload = resolve;
    });
    fake.checkForUpdates.mockResolvedValue(makeUpdateCheckResult('0.3.0', downloadPromise));

    const checkPromise = updater.check();
    fake.emit('update-downloaded', { version: '0.3.0', downloadedFile: 'C:\\x\\0.3.0.exe' });
    resolveDownload([]);
    const result = await checkPromise;

    expect(result).toEqual({ status: 'ready' });
    const bodies = notifier.calls.map((call) => call.body);
    expect(bodies.some((body) => body.includes('0.3.0') && body.includes('正在后台下载'))).toBe(true);
    expect(bodies.some((body) => body.includes('重启后自动更新'))).toBe(true);
  });

  it('更新已下载完成 (downloadPromise 为空) → 保持 ready, 不覆盖状态', async () => {
    const { fake, updater } = setup({ isInstaller: true });
    fake.emit('update-downloaded', { version: '0.3.0', downloadedFile: 'C:\\x\\0.3.0.exe' });
    fake.checkForUpdates.mockResolvedValue(makeUpdateCheckResult('0.3.0', null));

    const result = await updater.check({ silent: true });

    expect(result).toEqual({ status: 'ready' });
    expect(updater.getPhase()).toEqual({ phase: 'ready' });
  });

  it('下载失败 → error 结果 + 失败通知, 不崩溃', async () => {
    const { fake, notifier, updater } = setup({ isInstaller: true });
    fake.checkForUpdates.mockResolvedValue(
      makeUpdateCheckResult('0.3.0', Promise.reject(new Error('下载中断'))),
    );

    const result = await updater.check();

    expect(result).toEqual({ status: 'error', message: '下载中断' });
    expect(updater.getPhase()).toEqual({ phase: 'error', message: '下载中断' });
    expect(notifier.calls.some((call) => call.title === '检查更新失败')).toBe(true);
  });

  it('download-progress 事件 → phase 记录进度 (debug 级日志, 不弹通知)', () => {
    const { fake, logger, notifier, updater } = setup({ isInstaller: true });

    fake.emit('download-progress', { percent: 42.5 });

    expect(updater.getPhase()).toEqual({ phase: 'downloading', percent: 42.5 });
    expect(logger.debug).toHaveBeenCalledWith('下载进度 42.5%');
    expect(notifier.calls).toHaveLength(0);
  });
});

describe('createUpdater — 降级路径 (无发布配置 / 离线 / 未知错误)', () => {
  it('ERR_UPDATER_DISABLED (无 app-update.yml) → not-available, 静默不弹通知', async () => {
    const { fake, notifier, updater } = setup({ isInstaller: true });
    fake.checkForUpdates.mockRejectedValue(
      Object.assign(new Error('Cannot find app-update.yml file, please ensure update configuration exists'), {
        code: 'ERR_UPDATER_DISABLED',
      }),
    );

    const result = await updater.check({ silent: true });

    expect(result).toEqual({ status: 'not-available' });
    expect(updater.getPhase()).toEqual({ phase: 'not-available' });
    expect(notifier.calls).toHaveLength(0);
  });

  it('网络错误 (ENOTFOUND) → not-available; 手动检查弹"暂时无法检查更新"', async () => {
    const { fake, notifier, updater } = setup({ isInstaller: true });
    fake.checkForUpdates.mockRejectedValue(
      Object.assign(new Error('getaddrinfo ENOTFOUND api.github.com'), { code: 'ENOTFOUND' }),
    );

    const result = await updater.check();

    expect(result).toEqual({ status: 'not-available' });
    expect(updater.getPhase()).toEqual({ phase: 'not-available' });
    expect(notifier.calls).toContainEqual({
      title: '检查更新',
      body: '暂时无法检查更新（无更新源或离线）',
    });
  });

  it('其它未知错误 → error 结果 + 失败通知 (仍不崩溃)', async () => {
    const { fake, notifier, updater } = setup({ isInstaller: true });
    fake.checkForUpdates.mockRejectedValue(new Error('something unexpected'));

    const result = await updater.check();

    expect(result).toEqual({ status: 'error', message: 'something unexpected' });
    expect(updater.getPhase()).toEqual({ phase: 'error', message: 'something unexpected' });
    expect(notifier.calls.some((call) => call.title === '检查更新失败')).toBe(true);
  });

  it('error 事件 (下载期异步错误) → 记录日志 + phase=error, 不抛异常', () => {
    const { fake, logger, updater } = setup({ isInstaller: true });

    expect(() => fake.emit('error', new Error('网络中断'))).not.toThrow();

    expect(updater.getPhase()).toEqual({ phase: 'error', message: '网络中断' });
    expect(logger.error).toHaveBeenCalledWith('更新错误: 网络中断');
  });
});

describe('createUpdater — 便携版 (zip, isInstaller=false)', () => {
  it('手动检查 → 通知 + 打开 GitHub Releases 页, 不调用 electron-updater', async () => {
    const { fake, notifier, openExternal, updater } = setup({ isInstaller: false });

    const result = await updater.check();

    expect(result).toEqual({ status: 'available' });
    expect(fake.checkForUpdates).not.toHaveBeenCalled();
    expect(notifier.calls).toContainEqual({
      title: '检查更新',
      body: '便携版更新请前往 GitHub Releases 页面下载最新版本',
    });
    expect(openExternal).toHaveBeenCalledWith('https://github.com/SnowCrescenter-tech/dsh-desktop/releases');
  });

  it('静默检查 → 不通知、不开页面 (启动自检不打扰便携版用户)', async () => {
    const { fake, notifier, openExternal, updater } = setup({ isInstaller: false });

    const result = await updater.check({ silent: true });

    expect(result).toEqual({ status: 'available' });
    expect(notifier.calls).toHaveLength(0);
    expect(openExternal).not.toHaveBeenCalled();
    expect(fake.checkForUpdates).not.toHaveBeenCalled();
  });

  it('打开 Releases 页失败 → 仅告警日志, 检查结果不受影响', async () => {
    const { logger, openExternal, updater } = setup({ isInstaller: false });
    openExternal.mockRejectedValue(new Error('no default browser'));

    const result = await updater.check();

    expect(result).toEqual({ status: 'available' });
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('打开 Releases 页面失败'));
  });
});

describe('createUpdater — quitAndInstall 安全护栏', () => {
  it('更新未就绪 → 忽略, 不调用 electron-updater.quitAndInstall', () => {
    const { fake, updater } = setup({ isInstaller: true });

    updater.quitAndInstall();

    expect(fake.quitAndInstall).not.toHaveBeenCalled();
  });

  it('更新就绪后 → 调用 electron-updater.quitAndInstall', () => {
    const { fake, updater } = setup({ isInstaller: true });
    fake.emit('update-downloaded', {});

    updater.quitAndInstall();

    expect(fake.quitAndInstall).toHaveBeenCalledTimes(1);
  });
});

describe('createUpdateLogger — electron-updater Logger 形状', () => {
  it('四个级别都落到 console 且带 [updater] 前缀 (真实 logger, 非 no-op)', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logger = createUpdateLogger();

    logger.debug('d1');
    logger.info('i1');
    logger.warn('w1');
    logger.error('e1');

    expect(debugSpy).toHaveBeenCalledWith('[updater]', 'd1');
    expect(infoSpy).toHaveBeenCalledWith('[updater]', 'i1');
    expect(warnSpy).toHaveBeenCalledWith('[updater]', 'w1');
    expect(errorSpy).toHaveBeenCalledWith('[updater]', 'e1');

    debugSpy.mockRestore();
    infoSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
