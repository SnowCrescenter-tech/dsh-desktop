import { Readable } from 'node:stream';
import type { SpawnOptions } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import {
  buildSpawnArgs,
  buildTaskKillArgs,
  killDsh,
  spawnDshWith,
} from '../process-handle.js';
import type { SpawnFn } from '../process-handle.js';

describe('buildSpawnArgs', () => {
  it('默认参数：--profile desktop --port 0', () => {
    expect(buildSpawnArgs({ binPath: 'C:\\app\\bin.js' })).toEqual([
      'C:\\app\\bin.js',
      '--profile',
      'desktop',
      '--port',
      '0',
    ]);
  });

  it('自定义 profile 与端口透传', () => {
    expect(buildSpawnArgs({ binPath: 'bin.js', profile: 'staging', port: 8123 })).toEqual([
      'bin.js',
      '--profile',
      'staging',
      '--port',
      '8123',
    ]);
  });

  it('--port 0 路径：显式 port: 0 与省略一致', () => {
    expect(buildSpawnArgs({ binPath: 'bin.js', port: 0 })).toEqual([
      'bin.js',
      '--profile',
      'desktop',
      '--port',
      '0',
    ]);
  });
});

describe('spawnDshWith', () => {
  function makeFakeSpawn(pid = 4242) {
    const calls: Array<{
      command: string;
      args: string[];
      options: SpawnOptions;
    }> = [];
    const spawnFn: SpawnFn = (command, args, options) => {
      calls.push({ command, args, options });
      return {
        pid,
        stdout: new Readable({ read() {} }),
        stderr: new Readable({ read() {} }),
        on: vi.fn(),
        off: vi.fn(),
      };
    };
    return { spawnFn, calls };
  }

  it('以 node 启动 bin.js 并携带 windowsHide:true 与 pipe 管道', () => {
    const { spawnFn, calls } = makeFakeSpawn();
    spawnDshWith(spawnFn, { binPath: 'C:\\app\\bin.js' });
    expect(calls).toEqual([
      {
        command: 'node',
        args: ['C:\\app\\bin.js', '--profile', 'desktop', '--port', '0'],
        options: { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
      },
    ]);
  });

  it('windowsHide:false 与 cwd 透传', () => {
    const { spawnFn, calls } = makeFakeSpawn();
    spawnDshWith(spawnFn, { binPath: 'bin.js', windowsHide: false, cwd: 'D:\\work' });
    expect(calls).toEqual([
      {
        command: 'node',
        args: ['bin.js', '--profile', 'desktop', '--port', '0'],
        options: { windowsHide: false, cwd: 'D:\\work', stdio: ['ignore', 'pipe', 'pipe'] },
      },
    ]);
  });

  it('返回进程句柄（pid 来自子进程）', () => {
    const { spawnFn } = makeFakeSpawn(9001);
    const proc = spawnDshWith(spawnFn, { binPath: 'bin.js' });
    expect(proc.pid).toBe(9001);
  });

  it('缺少 pid 时抛错', () => {
    const spawnFn: SpawnFn = (_command, _args, _options) => ({
      pid: undefined,
      stdout: null,
      stderr: null,
      on: vi.fn(),
      off: vi.fn(),
    });
    expect(() => spawnDshWith(spawnFn, { binPath: 'bin.js' })).toThrow(/未正常创建/);
  });

  it('onExit 返回取消订阅函数', () => {
    const { spawnFn } = makeFakeSpawn();
    const proc = spawnDshWith(spawnFn, { binPath: 'bin.js' });
    const unsubscribe = proc.onExit(() => {});
    expect(typeof unsubscribe).toBe('function');
  });
});

describe('buildTaskKillArgs / killDsh', () => {
  it('buildTaskKillArgs 生成 taskkill 树杀参数', () => {
    expect(buildTaskKillArgs(4242)).toEqual(['/PID', '4242', '/T', '/F']);
  });

  it('Windows 下 kill：先 SIGTERM 再 taskkill', async () => {
    const order: string[] = [];
    const signal = vi.fn(() => {
      order.push('signal');
      return true;
    });
    const taskkill = vi.fn(async () => {
      order.push('taskkill');
    });
    await killDsh({ pid: 4242 }, { platform: 'win32', signal, taskkill });
    expect(signal).toHaveBeenCalledWith(4242, 'SIGTERM');
    expect(taskkill).toHaveBeenCalledWith(4242);
    expect(order).toEqual(['signal', 'taskkill']); // 顺序：SIGTERM 必须发生在 taskkill 之前
  });

  it('SIGTERM 抛错（进程已死）时仍执行 taskkill', async () => {
    const signal = vi.fn(() => {
      throw new Error('ESRCH: no such process');
    });
    const taskkill = vi.fn(async () => {});
    await expect(
      killDsh({ pid: 4242 }, { platform: 'win32', signal, taskkill }),
    ).resolves.toBeUndefined();
    expect(taskkill).toHaveBeenCalledWith(4242);
  });

  it('非 Windows 平台不执行 taskkill', async () => {
    const signal = vi.fn(() => true);
    const taskkill = vi.fn(async () => {});
    await killDsh({ pid: 4242 }, { platform: 'darwin', signal, taskkill });
    expect(signal).toHaveBeenCalledWith(4242, 'SIGTERM');
    expect(taskkill).not.toHaveBeenCalled();
  });
});
