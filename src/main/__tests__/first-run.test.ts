/**
 * first-run.ts 首次运行编排测试 —— 注入 fake controller / spawn / kill /
 * showOnboarding / prepareProfile, 用真实 createSupervisor (纯状态机) 驱动。
 *
 * 覆盖的流程分支:
 *   - 已配置 Key → prepareProfile + spawn → 就绪行 → loadDsh + 状态 running;
 *   - 未配置 Key → 弹引导对话框; 关闭后仍无 Key → 错误视图;
 *   - 引导关闭后已有 Key → 进入启动流程;
 *   - 就绪前子进程退出 → 状态 error + 错误视图, 重试重新启动;
 *   - 就绪超时 → 状态 error;
 *   - prepareProfile 抛错 → 状态 error + 错误视图;
 *   - stop() → 终止子进程树。
 */
import { EventEmitter } from 'node:events';
import type { BrowserWindow } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ServiceStatus } from '../../shared/contract.js';
import { createFirstRun } from '../first-run.js';
import type { FirstRunDeps } from '../first-run.js';
import type { DshProcess } from '../runtime/process-handle.js';
import type { DshWindowController } from '../window.js';

/** fake 子进程: stdout/stderr 用 EventEmitter 同步驱动, 结构兼容 DshProcess */
function makeProcess() {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const exitListeners: Array<(code: number | null, signal: NodeJS.Signals | null) => void> = [];
  const proc = {
    pid: 4242,
    stdout,
    stderr,
    onExit(listener: (code: number | null, signal: NodeJS.Signals | null) => void) {
      exitListeners.push(listener);
      return () => {};
    },
  } as unknown as DshProcess;
  return {
    proc,
    emitLine: (line: string) => {
      stdout.emit('data', Buffer.from(`${line}\n`, 'utf8'));
    },
    emitExit: (code: number | null, signal: NodeJS.Signals | null = null) => {
      for (const listener of exitListeners.splice(0)) {
        listener(code, signal);
      }
    },
  };
}

/** fake 引导对话框: 支持 once('closed', cb) */
function makeDialog() {
  const listeners = new Map<string, Array<() => void>>();
  const dialog = {
    once(event: string, listener: () => void) {
      const set = listeners.get(event) ?? [];
      set.push(listener);
      listeners.set(event, set);
      return dialog;
    },
  } as unknown as BrowserWindow;
  return {
    dialog,
    emitClosed: () => {
      for (const listener of listeners.get('closed') ?? []) {
        listener();
      }
    },
  };
}

/** 构造 createFirstRun 的最小依赖集 */
function makeDeps(overrides: Partial<FirstRunDeps> = {}) {
  let keyConfigured = overrides.hasKey ? undefined : true;
  const loadDshUrl = vi.fn();
  const getWindow = vi.fn(() => ({} as unknown as BrowserWindow));
  const controller = { loadDshUrl, getWindow } as unknown as DshWindowController;
  const emitStatus = vi.fn();
  const showErrorView = vi.fn();
  const prepareProfile = vi.fn();
  const spawn = vi.fn(() => makeProcess().proc);
  const kill = vi.fn(async () => {});

  const deps: FirstRunDeps = {
    dshHome: 'C:\\Users\\TestUser\\.dsh',
    binJs: 'C:\\app\\bin.js',
    pluginRoot: 'C:\\app\\client',
    controller,
    hasKey: () => keyConfigured === true,
    showOnboarding: vi.fn(() => makeDialog().dialog),
    emitStatus,
    showErrorView,
    prepareProfile,
    spawn,
    kill,
    ...overrides,
  };
  return {
    deps,
    loadDshUrl,
    getWindow,
    emitStatus,
    showErrorView,
    prepareProfile,
    spawn,
    kill,
    setKeyConfigured: (value: boolean) => {
      keyConfigured = value;
    },
  };
}

/** 取最后一次 emitStatus 的调用 (夹具助手) */
function lastStatus(emitStatus: ReturnType<typeof vi.fn>): ServiceStatus {
  const call = emitStatus.mock.calls[emitStatus.mock.calls.length - 1];
  const status = call?.[0] as ServiceStatus | undefined;
  if (status === undefined) {
    throw new Error('未上报任何状态');
  }
  return status;
}

/** 取 showErrorView 最后一次调用里的重试回调 (实际返回 Promise, 便于 await) */
function lastRetry(showErrorView: ReturnType<typeof vi.fn>): () => Promise<void> {
  const call = showErrorView.mock.calls[showErrorView.mock.calls.length - 1];
  const onRetry = call?.[1] as (() => Promise<void>) | undefined;
  if (onRetry === undefined) {
    throw new Error('错误视图未注册重试回调');
  }
  return onRetry;
}

describe('createFirstRun — 启动编排', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('已配置 Key: prepareProfile + spawn 携带正确参数, 状态 starting', () => {
    const ctx = makeDeps();
    const firstRun = createFirstRun(ctx.deps);
    firstRun.start();

    expect(ctx.prepareProfile).toHaveBeenCalledTimes(1);
    expect(ctx.spawn).toHaveBeenCalledTimes(1);
    expect(ctx.spawn).toHaveBeenCalledWith({
      binPath: 'C:\\app\\bin.js',
      profile: 'desktop',
      port: 0,
      cwd: 'C:\\Users\\TestUser\\.dsh',
    });
    expect(lastStatus(ctx.emitStatus)).toEqual({ phase: 'starting' });
  });

  it('就绪行解析: loadDshUrl 指向 http://host:port 且状态为 running', () => {
    const ctx = makeDeps();
    const firstRun = createFirstRun(ctx.deps);
    const fake = makeProcess();
    ctx.spawn.mockReturnValue(fake.proc);
    firstRun.start();

    fake.emitLine('dsh web: http://127.0.0.1:8123');
    expect(ctx.loadDshUrl).toHaveBeenCalledWith('http://127.0.0.1:8123');
    expect(lastStatus(ctx.emitStatus)).toEqual({
      phase: 'running',
      url: 'http://127.0.0.1:8123',
    });
  });

  it('就绪前子进程退出: 状态 error + 错误视图, 重试重新启动', async () => {
    const ctx = makeDeps();
    const firstRun = createFirstRun(ctx.deps);
    const fake = makeProcess();
    ctx.spawn.mockReturnValue(fake.proc);
    firstRun.start();

    fake.emitExit(1);
    expect(lastStatus(ctx.emitStatus)).toEqual({ phase: 'error', message: expect.stringContaining('就绪前退出') as unknown as string });
    expect(ctx.showErrorView).toHaveBeenCalledTimes(1);

    // 点"重试" → stop() 清场后重新启动
    const retry = lastRetry(ctx.showErrorView);
    await retry();
    expect(ctx.kill).toHaveBeenCalledTimes(1); // 残留进程树被杀
    expect(ctx.spawn).toHaveBeenCalledTimes(2);
  });

  it('就绪并接管 (running) 后子进程退出: 状态 error + 错误视图', () => {
    const ctx = makeDeps();
    const firstRun = createFirstRun(ctx.deps);
    const fake = makeProcess();
    ctx.spawn.mockReturnValue(fake.proc);
    firstRun.start();

    fake.emitLine('dsh web: http://127.0.0.1:8123');
    fake.emitExit(0);
    expect(lastStatus(ctx.emitStatus)).toEqual({
      phase: 'error',
      message: expect.stringContaining('本地服务已退出') as unknown as string,
    });
    expect(ctx.showErrorView).toHaveBeenCalledTimes(1);
  });

  it('就绪超时: 状态 error (timeout)', () => {
    const ctx = makeDeps();
    const firstRun = createFirstRun(ctx.deps);
    const fake = makeProcess();
    ctx.spawn.mockReturnValue(fake.proc);
    firstRun.start();

    vi.advanceTimersByTime(120_001);
    expect(lastStatus(ctx.emitStatus)).toEqual({
      phase: 'error',
      message: expect.stringContaining('超时') as unknown as string,
    });
    expect(ctx.showErrorView).toHaveBeenCalledTimes(1);
  });

  it('prepareProfile 抛错: 状态 error + 错误视图, 不 spawn', () => {
    const ctx = makeDeps();
    ctx.prepareProfile.mockImplementation(() => {
      throw new Error('插件安装失败');
    });
    const firstRun = createFirstRun(ctx.deps);
    firstRun.start();

    expect(ctx.spawn).not.toHaveBeenCalled();
    expect(lastStatus(ctx.emitStatus)).toEqual({ phase: 'error', message: '插件安装失败' });
    expect(ctx.showErrorView).toHaveBeenCalledTimes(1);
  });

  it('未配置 Key: 弹引导对话框, 不启动运行时', () => {
    const ctx = makeDeps();
    ctx.setKeyConfigured(false);
    const firstRun = createFirstRun(ctx.deps);
    firstRun.start();

    expect(ctx.deps.showOnboarding).toHaveBeenCalledTimes(1);
    expect(ctx.spawn).not.toHaveBeenCalled();
  });

  it('引导对话框关闭后已有 Key → 进入启动流程', () => {
    const ctx = makeDeps();
    ctx.setKeyConfigured(false);
    const firstRun = createFirstRun(ctx.deps);
    const { dialog, emitClosed } = makeDialog();
    ctx.deps.showOnboarding = vi.fn(() => dialog);
    const fake = makeProcess();
    ctx.spawn.mockReturnValue(fake.proc);
    firstRun.start();

    expect(ctx.spawn).not.toHaveBeenCalled();
    ctx.setKeyConfigured(true);
    emitClosed();
    expect(ctx.spawn).toHaveBeenCalledTimes(1);
  });

  it('引导对话框关闭后仍无 Key: 状态 error + 错误视图', () => {
    const ctx = makeDeps();
    ctx.setKeyConfigured(false);
    const firstRun = createFirstRun(ctx.deps);
    const { dialog, emitClosed } = makeDialog();
    ctx.deps.showOnboarding = vi.fn(() => dialog);
    firstRun.start();

    emitClosed();
    expect(ctx.spawn).not.toHaveBeenCalled();
    expect(lastStatus(ctx.emitStatus)).toEqual({
      phase: 'error',
      message: expect.stringContaining('API Key') as unknown as string,
    });
    expect(ctx.showErrorView).toHaveBeenCalledTimes(1);
  });

  it('stop(): 释放监督器并终止子进程树', async () => {
    const ctx = makeDeps();
    const firstRun = createFirstRun(ctx.deps);
    const fake = makeProcess();
    ctx.spawn.mockReturnValue(fake.proc);
    firstRun.start();

    await firstRun.stop();
    expect(ctx.kill).toHaveBeenCalledWith(fake.proc);
  });

  it('stop() 在未启动时是安全空操作', async () => {
    const ctx = makeDeps();
    const firstRun = createFirstRun(ctx.deps);
    await expect(firstRun.stop()).resolves.toBeUndefined();
    expect(ctx.kill).not.toHaveBeenCalled();
  });
});
