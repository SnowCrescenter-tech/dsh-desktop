import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupervisor } from '../state-machine.js';
import type { SupervisorState } from '../state-machine.js';

describe('createSupervisor 状态机', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const READY = 'dsh web: http://127.0.0.1:8123';

  function collectStates(sup: ReturnType<typeof createSupervisor>): SupervisorState[] {
    const states: SupervisorState[] = [];
    sup.on('state', (s) => states.push(s));
    return states;
  }

  it('初始状态为 idle', () => {
    expect(createSupervisor().getState()).toBe('idle');
  });

  it('start()：idle -> spawning', () => {
    const sup = createSupervisor();
    sup.start();
    expect(sup.getState()).toBe('spawning');
  });

  it('start() 重复调用抛非法迁移错误', () => {
    const sup = createSupervisor();
    sup.start();
    expect(() => sup.start()).toThrow(/非法状态迁移/);
  });

  it('markSpawned()：spawning -> waiting-ready', () => {
    const sup = createSupervisor();
    sup.start();
    sup.markSpawned();
    expect(sup.getState()).toBe('waiting-ready');
  });

  it('waiting-ready 收到就绪行：-> ready 并携带 host/port', () => {
    const sup = createSupervisor();
    const onReady = vi.fn();
    sup.on('ready', onReady);
    sup.start();
    sup.markSpawned();
    sup.handleStdoutLine(READY);
    expect(sup.getState()).toBe('ready');
    expect(onReady).toHaveBeenCalledWith({ host: '127.0.0.1', port: 8123 });
    expect(sup.getReadyInfo()).toEqual({ host: '127.0.0.1', port: 8123 });
  });

  it('waiting-ready 收到垃圾行：保持 waiting-ready 且不发事件', () => {
    const sup = createSupervisor();
    const onReady = vi.fn();
    const onError = vi.fn();
    sup.on('ready', onReady);
    sup.on('error', onError);
    sup.start();
    sup.markSpawned();
    sup.handleStdoutLine('some garbage log line');
    expect(sup.getState()).toBe('waiting-ready');
    expect(onReady).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('LAN 后缀就绪行同样触发 ready', () => {
    const sup = createSupervisor();
    const onReady = vi.fn();
    sup.on('ready', onReady);
    sup.start();
    sup.markSpawned();
    sup.handleStdoutLine('dsh web: http://127.0.0.1:8123 (LAN: http://192.168.1.5:8123)');
    expect(sup.getState()).toBe('ready');
    expect(onReady).toHaveBeenCalledWith({ host: '127.0.0.1', port: 8123 });
  });

  it('stdout 分块到达：行缓冲拼接后仍能识别就绪行', () => {
    const sup = createSupervisor();
    const onReady = vi.fn();
    sup.on('ready', onReady);
    sup.start();
    sup.markSpawned();
    sup.handleStdoutChunk('dsh web: http://127.0.0.1:81');
    expect(sup.getState()).toBe('waiting-ready');
    sup.handleStdoutChunk('23\n');
    expect(sup.getState()).toBe('ready');
    expect(onReady).toHaveBeenCalledWith({ host: '127.0.0.1', port: 8123 });
  });

  it('未带换行结尾的完整行不会触发，补上 \\n 才触发', () => {
    const sup = createSupervisor();
    sup.start();
    sup.markSpawned();
    sup.handleStdoutChunk(READY);
    expect(sup.getState()).toBe('waiting-ready');
    sup.handleStdoutChunk('\n');
    expect(sup.getState()).toBe('ready');
  });

  it('CRLF 行尾（\\r\\n）也能识别', () => {
    const sup = createSupervisor();
    sup.start();
    sup.markSpawned();
    sup.handleStdoutChunk(`${READY}\r\n`);
    expect(sup.getState()).toBe('ready');
  });

  it('默认 120 秒就绪超时：-> error(timeout)', () => {
    const sup = createSupervisor();
    const onError = vi.fn();
    sup.on('error', onError);
    sup.start();
    sup.markSpawned();
    vi.advanceTimersByTime(120_000);
    expect(sup.getState()).toBe('error');
    expect(sup.getError()?.reason).toBe('timeout');
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('120 秒前不触发超时', () => {
    const sup = createSupervisor();
    sup.start();
    sup.markSpawned();
    vi.advanceTimersByTime(119_999);
    expect(sup.getState()).toBe('waiting-ready');
  });

  it('自定义就绪超时生效', () => {
    const sup = createSupervisor({ readyTimeoutMs: 5_000 });
    sup.start();
    sup.markSpawned();
    vi.advanceTimersByTime(5_000);
    expect(sup.getState()).toBe('error');
    expect(sup.getError()?.reason).toBe('timeout');
  });

  it('就绪后超时定时器已清除，不再进入 error', () => {
    const sup = createSupervisor();
    const onError = vi.fn();
    sup.on('error', onError);
    sup.start();
    sup.markSpawned();
    sup.handleStdoutLine(READY);
    vi.advanceTimersByTime(200_000);
    expect(sup.getState()).toBe('ready');
    expect(onError).not.toHaveBeenCalled();
  });

  it('就绪前退出：-> error(exited-before-ready)', () => {
    const sup = createSupervisor();
    const onError = vi.fn();
    sup.on('error', onError);
    sup.start();
    sup.markSpawned();
    sup.handleExit({ code: 1, signal: null });
    expect(sup.getState()).toBe('error');
    expect(sup.getError()?.reason).toBe('exited-before-ready');
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('spawning 阶段直接退出：-> error(exited-before-ready)', () => {
    const sup = createSupervisor();
    sup.start();
    sup.handleExit({ code: 1, signal: null });
    expect(sup.getState()).toBe('error');
    expect(sup.getError()?.reason).toBe('exited-before-ready');
  });

  it('markRunning()：ready -> running', () => {
    const sup = createSupervisor();
    sup.start();
    sup.markSpawned();
    sup.handleStdoutLine(READY);
    sup.markRunning();
    expect(sup.getState()).toBe('running');
  });

  it('running 后退出：-> exited 并携带 code/signal', () => {
    const sup = createSupervisor();
    const onExited = vi.fn();
    sup.on('exited', onExited);
    sup.start();
    sup.markSpawned();
    sup.handleStdoutLine(READY);
    sup.markRunning();
    sup.handleExit({ code: 0, signal: null });
    expect(sup.getState()).toBe('exited');
    expect(onExited).toHaveBeenCalledWith({ code: 0, signal: null });
    expect(sup.getExitInfo()).toEqual({ code: 0, signal: null });
  });

  it('ready 阶段退出：-> exited（服务曾就绪，视为正常退出）', () => {
    const sup = createSupervisor();
    sup.start();
    sup.markSpawned();
    sup.handleStdoutLine(READY);
    sup.handleExit({ code: 0, signal: null });
    expect(sup.getState()).toBe('exited');
  });

  it('终态（exited）后的事件被忽略', () => {
    const sup = createSupervisor();
    const onExited = vi.fn();
    sup.on('exited', onExited);
    sup.start();
    sup.markSpawned();
    sup.handleStdoutLine(READY);
    sup.markRunning();
    sup.handleExit({ code: 0, signal: null });
    sup.handleExit({ code: 2, signal: null }); // 再次退出：应忽略
    expect(sup.getState()).toBe('exited');
    expect(onExited).toHaveBeenCalledTimes(1);
  });

  it('终态（error）后 stdout 与退出事件被忽略', () => {
    const sup = createSupervisor();
    sup.start();
    sup.markSpawned();
    vi.advanceTimersByTime(120_000);
    sup.handleStdoutLine(READY); // 迟到的就绪行
    sup.handleExit({ code: 1, signal: null });
    expect(sup.getState()).toBe('error');
  });

  it('dispose 后定时器不再触发超时', () => {
    const sup = createSupervisor();
    sup.start();
    sup.markSpawned();
    sup.dispose();
    vi.advanceTimersByTime(200_000);
    expect(sup.getState()).toBe('waiting-ready');
  });

  it('state 事件按生命周期顺序触发', () => {
    const sup = createSupervisor();
    const states = collectStates(sup);
    sup.start();
    sup.markSpawned();
    sup.handleStdoutLine(READY);
    sup.markRunning();
    sup.handleExit({ code: 0, signal: null });
    expect(states).toEqual(['spawning', 'waiting-ready', 'ready', 'running', 'exited']);
  });

  it('错误路径的 state 事件序列', () => {
    const sup = createSupervisor();
    const states = collectStates(sup);
    sup.start();
    sup.markSpawned();
    vi.advanceTimersByTime(120_000);
    expect(states).toEqual(['spawning', 'waiting-ready', 'error']);
  });
});
