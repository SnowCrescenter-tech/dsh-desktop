/**
 * dsh 子进程运行时监督器 —— 纯状态机,不直接触碰 child_process。
 *
 * 生命周期: idle → spawning → waiting-ready → ready → running → exited | error(timeout)
 *
 * 组合根 (T15) 通过显式方法驱动状态机、通过类型化事件消费结果:
 *   - start() 请求启动
 *   - markSpawned() 报告 spawn 成功,开始等待就绪行
 *   - handleStdoutChunk / handleStdoutLine 送入子进程 stdout
 *   - handleExit() 报告子进程退出
 *   - markRunning() 组合根确认接管(如窗口已加载)后进入稳定运行态
 *
 * 事件: state(每次迁移) / ready(携带 host+port) / error(超时或就绪前退出) / exited
 *
 * 失败路径只有两个: 等待就绪超时 (error: timeout), 就绪之前子进程退出
 * (error: exited-before-ready)。就绪/运行之后退出属于正常生命周期 (exited)。
 */
import { parseReadyLine } from './ready-line.js';
import type { ReadyInfo } from './ready-line.js';

/** 监督器状态 */
export type SupervisorState =
  | 'idle' // 初始:尚未启动
  | 'spawning' // 已请求启动,等待子进程创建
  | 'waiting-ready' // 子进程已创建,等待就绪行
  | 'ready' // 就绪行已解析到,端口已知
  | 'running' // 组合根确认接管,稳定运行态
  | 'exited' // 就绪/运行后正常退出
  | 'error'; // 失败终态:timeout 或 exited-before-ready

/** error 状态的原因 */
export type SupervisorErrorReason = 'timeout' | 'exited-before-ready';

/** error 状态详情 */
export interface SupervisorError {
  reason: SupervisorErrorReason;
  message: string;
  code: number | null;
  signal: NodeJS.Signals | null;
}

/** 子进程退出信息 (Node 'exit' 事件参数) */
export interface SupervisorExitInfo {
  code: number | null;
  signal: NodeJS.Signals | null;
}

export interface SupervisorOptions {
  /** 就绪等待超时(毫秒),默认 120 秒 */
  readyTimeoutMs?: number;
}

/** 事件名 → 载荷类型的映射,on() 据此做类型推断 */
export interface SupervisorEventMap {
  state: SupervisorState;
  ready: ReadyInfo;
  error: SupervisorError;
  exited: SupervisorExitInfo;
}

/** 组合根 (T15) 可消费的监督器 API */
export interface DshSupervisor {
  getState(): SupervisorState;
  getReadyInfo(): ReadyInfo | null;
  getError(): SupervisorError | null;
  getExitInfo(): SupervisorExitInfo | null;
  start(): void;
  markSpawned(): void;
  markRunning(): void;
  handleStdoutChunk(chunk: string): void;
  handleStdoutLine(line: string): void;
  handleExit(info: SupervisorExitInfo): void;
  on<K extends keyof SupervisorEventMap>(
    event: K,
    listener: (payload: SupervisorEventMap[K]) => void,
  ): this;
  dispose(): void;
}

/**
 * 非法状态迁移错误。
 * 用户主动调用的迁移方法 (start/markSpawned/markRunning) 在错误状态下调用时
 * 抛出此错误而非静默忽略,让组合根的接线 bug 尽早暴露。
 */
export class SupervisorTransitionError extends Error {
  constructor(
    readonly from: SupervisorState,
    readonly to: SupervisorState,
  ) {
    super(`非法状态迁移:${from} -> ${to}`);
    this.name = 'SupervisorTransitionError';
  }
}

const DEFAULT_READY_TIMEOUT_MS = 120_000;

class Supervisor implements DshSupervisor {
  private current: SupervisorState = 'idle';
  private readyInfo: ReadyInfo | null = null;
  private failure: SupervisorError | null = null;
  private exitInfo: SupervisorExitInfo | null = null;
  private readonly readyTimeoutMs: number;
  private timer: NodeJS.Timeout | null = null;
  private stdoutBuffer = '';

  // 自实现的轻量类型化事件存储:按事件名分桶,on() 由映射类型驱动类型推断。
  // 不继承 EventEmitter —— 避开其 'error' 事件"无监听者即抛错"的特殊语义,
  // 以及 listener: (...args: any[]) 对严格类型的污染。
  private readonly listeners: {
    [K in keyof SupervisorEventMap]: Set<(payload: SupervisorEventMap[K]) => void>;
  } = {
    state: new Set(),
    ready: new Set(),
    error: new Set(),
    exited: new Set(),
  };

  constructor(options: SupervisorOptions = {}) {
    this.readyTimeoutMs = options.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS;
  }

  getState(): SupervisorState {
    return this.current;
  }

  getReadyInfo(): ReadyInfo | null {
    return this.readyInfo;
  }

  getError(): SupervisorError | null {
    return this.failure;
  }

  getExitInfo(): SupervisorExitInfo | null {
    return this.exitInfo;
  }

  on<K extends keyof SupervisorEventMap>(
    event: K,
    listener: (payload: SupervisorEventMap[K]) => void,
  ): this {
    // 映射类型按 K 索引得到对应事件的监听器集合,类型与 listener 参数天然对齐
    this.listeners[event].add(listener);
    return this;
  }

  start(): void {
    this.transition('spawning', 'idle');
  }

  markSpawned(): void {
    // spawn 已成功返回,进入等待就绪阶段,并启动就绪超时计时
    this.transition('waiting-ready', 'spawning');
    this.startReadyTimer();
  }

  markRunning(): void {
    this.transition('running', 'ready');
  }

  handleStdoutChunk(chunk: string): void {
    // stdout 按任意大小分块到达,一行可能被拆到相邻两个 chunk 里;
    // 先做行缓冲,按 \n 切行,再逐行交给 handleStdoutLine。
    this.stdoutBuffer += chunk;
    for (;;) {
      const nl = this.stdoutBuffer.indexOf('\n');
      if (nl === -1) {
        break;
      }
      const line = this.stdoutBuffer.slice(0, nl);
      this.stdoutBuffer = this.stdoutBuffer.slice(nl + 1);
      // Windows 行尾是 \r\n,去掉每行末尾的 \r
      this.handleStdoutLine(line.replace(/\r$/, ''));
    }
  }

  handleStdoutLine(line: string): void {
    // 只有"等待就绪"阶段才解析就绪行;运行中/终态的后续输出直接忽略
    if (this.current !== 'waiting-ready') {
      return;
    }
    const info = parseReadyLine(line);
    if (info === null) {
      return; // 日志、进度等无关行,忽略
    }
    this.clearReadyTimer();
    this.readyInfo = info;
    this.transition('ready', 'waiting-ready');
    this.emit('ready', info);
  }

  handleExit(info: SupervisorExitInfo): void {
    // 终态之后到达的退出事件直接忽略 (子进程收尾期可能有多余事件)
    if (this.current === 'exited' || this.current === 'error') {
      return;
    }
    this.exitInfo = info;
    if (this.current === 'ready' || this.current === 'running') {
      // 已就绪/运行后退出:服务曾可用,视为正常退出
      this.clearReadyTimer();
      this.transition('exited', this.current);
      this.emit('exited', info);
      return;
    }
    // spawning / waiting-ready 阶段退出:还没就绪就死了,视为启动失败
    this.clearReadyTimer();
    this.failure = {
      reason: 'exited-before-ready',
      message: `子进程在就绪前退出 (code=${info.code}, signal=${info.signal})`,
      code: info.code,
      signal: info.signal,
    };
    this.transition('error', this.current);
    this.emit('error', this.failure);
  }

  dispose(): void {
    // 释放定时器、缓冲与监听器,防止残留状态在对象销毁后仍被触发
    this.clearReadyTimer();
    this.stdoutBuffer = '';
    for (const event of Object.keys(this.listeners) as (keyof SupervisorEventMap)[]) {
      this.listeners[event].clear();
    }
  }

  // ---- 内部实现 ----

  private startReadyTimer(): void {
    this.clearReadyTimer();
    const timer = setTimeout(() => {
      this.timer = null;
      // 超时只对"仍在等待就绪"生效;期间已就绪/退出时定时器会被清除,这里是双保险
      if (this.current !== 'waiting-ready') {
        return;
      }
      this.failure = {
        reason: 'timeout',
        message: `等待 dsh 就绪超时(${this.readyTimeoutMs}ms)`,
        code: null,
        signal: null,
      };
      this.transition('error', 'waiting-ready');
      this.emit('error', this.failure);
    }, this.readyTimeoutMs);
    timer.unref(); // 不因等待定时器而阻止进程退出
    this.timer = timer;
  }

  private clearReadyTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** 校验并执行迁移;当前状态不属于允许集合时抛错 */
  private transition(to: SupervisorState, from: SupervisorState): void {
    if (this.current !== from) {
      throw new SupervisorTransitionError(this.current, to);
    }
    this.current = to;
    this.emit('state', to);
  }

  private emit<K extends keyof SupervisorEventMap>(
    event: K,
    payload: SupervisorEventMap[K],
  ): void {
    const set = this.listeners[event];
    for (const listener of set) {
      listener(payload);
    }
  }
}

/** 创建运行时监督器 */
export function createSupervisor(options: SupervisorOptions = {}): DshSupervisor {
  return new Supervisor(options);
}
