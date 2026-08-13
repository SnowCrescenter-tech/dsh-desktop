/**
 * 状态点色调映射单元测试 (设计规范 §3.1)。
 * 守护四条不变量: running→teal / starting→tertiary / stopped→tertiary /
 * error→error,任何 phase 都必须落在三个色调之一。
 */
import { describe, expect, it } from 'vitest';

import { statusDotTone, type StatusDotTone } from './status-dot.js';

describe('statusDotTone — 服务状态 → 状态点色调 (§3.1)', () => {
  it('running → teal 色调 (本地服务运行中)', () => {
    expect(statusDotTone({ phase: 'running', url: 'http://127.0.0.1:4000' })).toBe(
      'running',
    );
  });

  it('starting → tertiary 色调 (启动中/服务未就绪)', () => {
    expect(statusDotTone({ phase: 'starting' })).toBe('starting');
  });

  it('stopped → tertiary 色调 (已停止/尚未启动, 同未就绪)', () => {
    expect(statusDotTone({ phase: 'stopped' })).toBe('starting');
  });

  it('error → error 色调 (服务异常)', () => {
    expect(statusDotTone({ phase: 'error', message: '等待 dsh 就绪超时' })).toBe(
      'error',
    );
  });

  it('穷举覆盖: 四个 phase 全部落在合法色调集合内', () => {
    const states = [
      { phase: 'starting' },
      { phase: 'running', url: 'http://127.0.0.1:4000' },
      { phase: 'error', message: 'boom' },
      { phase: 'stopped' },
    ] as const;
    const tones = new Set<StatusDotTone>(
      states.map((s) => statusDotTone(s)),
    );
    expect([...tones].sort()).toEqual(['error', 'running', 'starting']);
  });
});
