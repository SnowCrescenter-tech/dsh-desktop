/**
 * 首次运行编排 (T15 组合根的一部分) —— 把 key 引导、profile 准备、子进程监督、
 * 状态上报与错误视图串成一条可注入的流程。
 *
 * 流程 (与设计规范 §4 对齐):
 *   1. 检查 API Key (env DEEPSEEK_API_KEY → $DSH_HOME/.env):
 *      未配置 → 弹引导对话框; 对话框关闭后重查, 仍无 Key 则报错 + 错误视图;
 *   2. 准备 desktop profile (buildProfileFiles 写盘 + installPlugin 安装客户端插件);
 *   3. 经 process-handle 启动 `node <bin.js> --profile desktop --port 0`;
 *   4. 用 state-machine 监督子进程:
 *        - 'ready'  → window.loadDsh(url) + 上报 running;
 *        - 'error'  (超时 / 就绪前退出) → 上报 error + 窗口内错误视图(重试);
 *        - 'exited' (就绪后退出)       → 上报 error + 错误视图(重试)。
 *
 * 全部副作用都可通过 deps 注入 (spawn / createSupervisor / kill / prepareProfile…),
 * 与 window.ts / process-handle.ts 同一套可测分层; 测试不触碰真实子进程。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { BrowserWindow } from 'electron';

import type { ServiceStatus } from '../shared/contract.js';
import { buildProfileFiles, stringifyPackageJson } from './profile/bootstrap.js';
import { installPlugin } from './profile/install.js';
import type { DshWindowController } from './window.js';
import { killDsh, spawnDsh } from './runtime/process-handle.js';
import type { DshProcess } from './runtime/process-handle.js';
import { createSupervisor } from './runtime/state-machine.js';
import type { DshSupervisor, SupervisorExitInfo } from './runtime/state-machine.js';
import type { ReadyInfo } from './runtime/ready-line.js';

/** 首次运行编排的注入面 */
export interface FirstRunDeps {
  /** DSH_HOME 根目录 */
  dshHome: string;
  /** 捆绑 dsh CLI 入口 (resolveBinJs 的结果, 绝对路径) */
  binJs: string;
  /** @dsh-desktop/client 插件源码根 (含 lib/ 与 package.json) */
  pluginRoot: string;
  /** resources/plugins 下的 tgz 打包产物 (离线复制不可用时的回退, 可缺省) */
  pluginTarball?: string;
  /** 主窗口控制器 (loadDsh / 引导对话框 parent) */
  controller: DshWindowController;
  /** 是否已配置 API Key (env 或 .env); 每次调用实时判定 */
  hasKey: () => boolean;
  /** 弹出引导对话框 (parent 为主窗口), 返回对话框窗口 */
  showOnboarding: (parent: BrowserWindow) => BrowserWindow;
  /** 服务状态上报 (标题栏状态点等) */
  emitStatus: (status: ServiceStatus) => void;
  /** 窗口内错误视图 (重试回调 = 重新走启动流程) */
  showErrorView: (message: string, onRetry: () => void) => void;
  /** 准备 desktop profile (buildProfileFiles 写盘 + installPlugin); 失败抛错 */
  prepareProfile: () => void;
  /** 生成 dsh 子进程; 默认 spawnDsh */
  spawn?: typeof spawnDsh;
  /** 创建运行时监督器; 默认 createSupervisor */
  createSupervisor?: typeof createSupervisor;
  /** 终止子进程树; 默认 killDsh */
  kill?: typeof killDsh;
}

/** 组合根可消费的首次运行控制器 */
export interface FirstRun {
  /** 启动编排 (幂等: 已在运行则忽略) */
  start(): void;
  /** 停止运行时: 终止子进程树并释放监督器 (退出前调用) */
  stop(): Promise<void>;
}

/** 默认 profile 准备: buildProfileFiles 写盘 + installPlugin 安装客户端插件 */
export function prepareDesktopProfile(deps: {
  dshHome: string;
  binJs: string;
  pluginRoot: string;
  pluginTarball?: string;
}): void {
  const files = buildProfileFiles(deps.dshHome);
  mkdirSync(files.dir, { recursive: true });
  writeFileSync(join(files.dir, 'package.json'), stringifyPackageJson(files.packageJson), 'utf8');
  writeFileSync(join(files.dir, 'cordis.patch.yml'), files.cordisPatch, 'utf8');
  installPlugin({
    dshHome: deps.dshHome,
    pluginRoot: deps.pluginRoot,
    dshBinJs: deps.binJs,
    // pluginTarball 缺省时不带该字段 (exactOptionalPropertyTypes 兼容)
    ...(deps.pluginTarball !== undefined ? { pluginTarball: deps.pluginTarball } : {}),
  });
}

/** 把任意异常收敛为可展示的中文错误消息 */
function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 创建首次运行编排 (全部依赖可注入) */
export function createFirstRun(deps: FirstRunDeps): FirstRun {
  const spawn = deps.spawn ?? spawnDsh;
  const createSupervisorFn = deps.createSupervisor ?? createSupervisor;
  const kill = deps.kill ?? killDsh;

  let supervisor: DshSupervisor | null = null;
  let child: DshProcess | null = null;

  /** 启动子进程并驱动监督器; prepareProfile / spawn 失败 → 错误视图 */
  function startRuntime(): void {
    deps.emitStatus({ phase: 'starting' });
    try {
      deps.prepareProfile();
    } catch (error) {
      fail(toMessage(error));
      return;
    }

    const sup = createSupervisorFn();
    supervisor = sup;
    sup.on('ready', (info) => onReady(sup, info));
    sup.on('error', (error) => fail(error.message));
    sup.on('exited', (info) => onExited(info));

    let proc: DshProcess;
    try {
      proc = spawn({ binPath: deps.binJs, profile: 'desktop', port: 0, cwd: deps.dshHome });
    } catch (error) {
      sup.dispose();
      supervisor = null;
      fail(toMessage(error));
      return;
    }
    child = proc;
    proc.stdout.on('data', (chunk) => sup.handleStdoutChunk(String(chunk)));
    proc.stderr.on('data', (chunk) => sup.handleStdoutChunk(String(chunk)));
    proc.onExit((code, signal) => sup.handleExit({ code, signal }));

    // idle → spawning → waiting-ready (启动就绪等待计时)
    sup.start();
    sup.markSpawned();
  }

  /** 就绪行已解析: 指向 Web UI + 上报 running + 确认接管 */
  function onReady(sup: DshSupervisor, info: ReadyInfo): void {
    const url = `http://${info.host}:${info.port}`;
    deps.controller.loadDshUrl(url);
    deps.emitStatus({ phase: 'running', url });
    // 窗口已接管 → 进入稳定运行态 (ready → running)
    sup.markRunning();
  }

  /** 就绪/运行后子进程退出: 服务不可用, 视为错误并给出重试入口 */
  function onExited(info: SupervisorExitInfo): void {
    fail(`本地服务已退出 (code=${info.code}, signal=${info.signal})`);
  }

  /** 统一失败路径: 上报 error + 窗口内错误视图 (重试 → 重新启动) */
  function fail(message: string): void {
    deps.emitStatus({ phase: 'error', message });
    deps.showErrorView(message, retry);
  }

  /** 重试: 先清掉残留子进程, 再走一遍完整启动流程 (返回 Promise 便于测试等待) */
  function retry(): Promise<void> {
    return stop().then(() => {
      start();
    });
  }

  /** 完整启动流程: 有 Key → 直接启动; 无 Key → 引导对话框, 关闭后重查 */
  function start(): void {
    if (!deps.hasKey()) {
      const dialog = deps.showOnboarding(deps.controller.getWindow());
      dialog.once('closed', () => {
        if (deps.hasKey()) {
          startRuntime();
        } else {
          fail('尚未配置 DeepSeek API Key，请点击重试重新引导');
        }
      });
      return;
    }
    startRuntime();
  }

  /** 停止运行时: 释放监督器并终止子进程树 (killDsh: SIGTERM + taskkill /T /F) */
  async function stop(): Promise<void> {
    supervisor?.dispose();
    supervisor = null;
    const proc = child;
    child = null;
    if (proc !== null) {
      await kill(proc);
    }
  }

  return { start, stop };
}
