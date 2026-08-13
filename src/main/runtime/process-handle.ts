/**
 * dsh 子进程句柄 —— 注入式的 spawn / kill 抽象。
 *
 * spawn:  `node <bin.js> --profile desktop --port 0` (windowsHide: true,
 *        桌面应用里不能弹出子进程控制台黑窗;port 0 让 dsh CLI 自选空闲端口)。
 *
 * kill:   先 SIGTERM 尝试优雅终止;再在 Windows 下用 `taskkill /PID <pid> /T /F`
 *         (树杀) 兜底 —— SIGTERM 在 Windows 上只杀父进程,子进程会残留,
 *         /T 递归结束整个进程树, /F 强制终止。
 *
 * 测试策略: spawn/kill 的核心逻辑都可通过注入 fake 驱动,不依赖真实子进程。
 */
import { execFile as nodeExecFile, spawn as nodeSpawn } from 'node:child_process';
import type { SpawnOptions } from 'node:child_process';
import type { Readable } from 'node:stream';

export interface DshSpawnOptions {
  /** dsh 入口脚本 (bin.js) 的绝对路径 */
  binPath: string;
  /** CLI profile,默认 'desktop' */
  profile?: string;
  /** 期望端口;0 (默认) 表示让 CLI 自选空闲端口 */
  port?: number;
  /** 是否隐藏子进程控制台窗口,默认 true */
  windowsHide?: boolean;
  /** 子进程工作目录 */
  cwd?: string;
}

/**
 * 最小化的"已生成子进程"结构:把真实 ChildProcess 收敛成我们用到的成员,
 * 方便测试注入 fake (真实 ChildProcess 结构上兼容本接口)。
 */
export interface SpawnedChild {
  // pid 用可选声明:真实 ChildProcess.pid 也是可选属性,保证结构兼容;
  // 真实值仍可能缺失 (spawn 失败时),toDshProcess 里会防御性检查。
  pid?: number;
  stdout: Readable | null;
  stderr: Readable | null;
  // 只声明运行时真正用到的 'exit' 订阅签名:
  // 它同时兼容真实 ChildProcess.on 的 'exit' 重载(以及兜底的泛型重载)
  // 与调用方传入的具体监听器,避免 (...args: any[]|never[]|unknown[]) 这类
  // 泛化签名在双向赋值时互相冲突。
  on(
    event: 'exit',
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): unknown;
  off(
    event: 'exit',
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): unknown;
}

/** 可注入的 spawn 函数;默认实现包装 child_process.spawn */
export type SpawnFn = (
  command: string,
  args: string[],
  options: SpawnOptions,
) => SpawnedChild;

/** 组合根 (T15) 可消费的进程句柄 */
export interface DshProcess {
  pid: number;
  stdout: Readable;
  stderr: Readable;
  /** 订阅退出事件,返回取消订阅函数 */
  onExit(listener: (code: number | null, signal: NodeJS.Signals | null) => void): () => void;
}

/** 构造 spawn 参数:`node <bin.js> --profile <profile> --port <port>` */
export function buildSpawnArgs(options: DshSpawnOptions): string[] {
  return [
    options.binPath,
    '--profile',
    options.profile ?? 'desktop',
    '--port',
    String(options.port ?? 0),
  ];
}

/** 默认 spawn 实现,包装真实 child_process.spawn (单签名包装,便于结构兼容 SpawnFn) */
const realSpawn: SpawnFn = (command, args, options) => nodeSpawn(command, args, options);

export function spawnDsh(options: DshSpawnOptions): DshProcess {
  return spawnDshWith(realSpawn, options);
}

/**
 * 注入 spawn 函数的变体:测试可传入 fake,断言命令行参数 / spawn 选项。
 */
export function spawnDshWith(spawnFn: SpawnFn, options: DshSpawnOptions): DshProcess {
  const child = spawnFn('node', buildSpawnArgs(options), buildSpawnOptions(options));
  return toDshProcess(child);
}

function buildSpawnOptions(options: DshSpawnOptions): SpawnOptions {
  return {
    windowsHide: options.windowsHide ?? true,
    stdio: ['ignore', 'pipe', 'pipe'],
    // 无 cwd 时不带该字段,避免显式传 undefined
    ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
  };
}

function toDshProcess(child: SpawnedChild): DshProcess {
  const { pid, stdout, stderr } = child;
  // stdio 明确要求了 pipe,正常情况下非空;这里做防御性检查,同时完成类型收窄
  if (pid === undefined || stdout === null || stderr === null) {
    throw new Error('dsh 子进程未正常创建(缺少 pid 或 stdout/stderr 管道)');
  }
  return {
    pid,
    stdout,
    stderr,
    onExit(listener) {
      child.on('exit', listener);
      return () => child.off('exit', listener);
    },
  };
}

/** taskkill 树杀参数:`/PID <pid> /T /F` */
export function buildTaskKillArgs(pid: number): string[] {
  return ['/PID', String(pid), '/T', '/F'];
}

export interface KillDeps {
  /** 测试注入:当前平台,默认 process.platform */
  platform?: NodeJS.Platform;
  /** 测试注入:发送信号的实现,默认 process.kill */
  signal?: (pid: number, signal: NodeJS.Signals) => boolean;
  /** 测试注入:执行 taskkill 的实现,默认经 execFile 调用系统 taskkill */
  taskkill?: (pid: number) => Promise<void>;
}

/** 结束 dsh 进程:先 SIGTERM,再按平台决定是否用 taskkill 树杀兜底 */
export async function killDsh(proc: { pid: number }, deps: KillDeps = {}): Promise<void> {
  const platform = deps.platform ?? process.platform;
  const sendSignal = deps.signal ?? ((pid, sig) => process.kill(pid, sig));
  const taskkill = deps.taskkill ?? runTaskkill;
  // 1) 先发 SIGTERM 尝试优雅终止;进程已不存在时 process.kill 抛 ESRCH,交给 taskkill 兜底
  try {
    sendSignal(proc.pid, 'SIGTERM');
  } catch {
    // 忽略:目标进程可能已经退出
  }
  // 2) Windows 下用 taskkill /T /F 递归强制结束整个进程树
  if (platform === 'win32') {
    await taskkill(proc.pid);
  }
}

function runTaskkill(pid: number): Promise<void> {
  return new Promise((resolve) => {
    // 无论成败都 resolve:SIGTERM 可能已把进程杀掉,taskkill 报"找不到进程"是正常情况
    nodeExecFile('taskkill', buildTaskKillArgs(pid), { windowsHide: true }, () => resolve());
  });
}
