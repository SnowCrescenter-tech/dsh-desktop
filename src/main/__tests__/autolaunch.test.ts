/**
 * 开机自启模块单元测试 —— 注册表值写入/删除 + 开关幂等。
 *
 * 全部用例注入 mock `RegExecutor`, 不触碰真实注册表:
 *   - 关闭 → 开启: 发生 `reg add`, 且 Run 值 = 带引号的 appPath;
 *   - 已开启 → 开启: 不触发任何写命令 (幂等);
 *   - 开启 → 关闭: 发生 `reg delete`;
 *   - 已关闭 → 关闭: 不触发任何写命令 (幂等);
 *   - 默认执行器对 reg 退出码的映射 (0 / 1 / 其它)。
 */
import { describe, expect, it } from 'vitest';

import {
  AUTOLAUNCH_RUN_KEY,
  AUTOLAUNCH_VALUE_NAME,
  buildAddArgs,
  buildDeleteArgs,
  buildQueryArgs,
  buildRunCommand,
  createAutolaunch,
  createRegExecutor,
  type RegExecutor,
} from '../autolaunch.js';

/** 测试用应用路径 (模拟带空格的安装路径) */
const APP_PATH = 'C:\\Program Files\\DeepSeek Harness\\dsh-desktop.exe';

/** mock 执行器返回的调用记录 (op + 参数) */
interface MockCall {
  op: 'query' | 'add' | 'delete';
  args: string[];
}

/** 构造记录型 mock 执行器; 内部状态跟随 add/delete 翻转 */
function createMockExecutor(initialEnabled = false) {
  const calls: MockCall[] = [];
  let enabled = initialEnabled;

  const reg: RegExecutor = {
    async query(key, valueName) {
      calls.push({ op: 'query', args: [key, valueName] });
      return enabled;
    },
    async add(key, valueName, value) {
      calls.push({ op: 'add', args: [key, valueName, value] });
      enabled = true;
    },
    async delete(key, valueName) {
      calls.push({ op: 'delete', args: [key, valueName] });
      enabled = false;
    },
  };

  return {
    reg,
    calls,
    /** mock 注册表内部状态 (不记录调用) */
    getEnabled: (): boolean => enabled,
  };
}

describe('buildRunCommand', () => {
  it('Run 值 = 带引号的 appPath (路径含空格时引号必需)', () => {
    expect(buildRunCommand(APP_PATH)).toBe('"C:\\Program Files\\DeepSeek Harness\\dsh-desktop.exe"');
  });
});

describe('createAutolaunch — 注册表值写入与删除', () => {
  it('关闭 → 开启: 下发 reg add, Run 值指向带引号的 appPath', async () => {
    const mock = createMockExecutor(false);
    const autolaunch = createAutolaunch({ reg: mock.reg, appPath: APP_PATH });

    await autolaunch.setEnabled(true);

    expect(mock.getEnabled()).toBe(true);
    expect(mock.calls).toEqual([
      { op: 'query', args: [AUTOLAUNCH_RUN_KEY, AUTOLAUNCH_VALUE_NAME] },
      { op: 'add', args: [AUTOLAUNCH_RUN_KEY, AUTOLAUNCH_VALUE_NAME, buildRunCommand(APP_PATH)] },
    ]);
  });

  it('开启 → 关闭: 下发 reg delete', async () => {
    const mock = createMockExecutor(true);
    const autolaunch = createAutolaunch({ reg: mock.reg, appPath: APP_PATH });

    await autolaunch.setEnabled(false);

    expect(mock.getEnabled()).toBe(false);
    expect(mock.calls).toEqual([
      { op: 'query', args: [AUTOLAUNCH_RUN_KEY, AUTOLAUNCH_VALUE_NAME] },
      { op: 'delete', args: [AUTOLAUNCH_RUN_KEY, AUTOLAUNCH_VALUE_NAME] },
    ]);
  });
});

describe('createAutolaunch — 开关幂等', () => {
  it('已开启 → 开启: 不触发任何写命令 (幂等)', async () => {
    const mock = createMockExecutor(true);
    const autolaunch = createAutolaunch({ reg: mock.reg, appPath: APP_PATH });

    await autolaunch.setEnabled(true);

    expect(mock.getEnabled()).toBe(true);
    expect(mock.calls).toEqual([
      { op: 'query', args: [AUTOLAUNCH_RUN_KEY, AUTOLAUNCH_VALUE_NAME] },
    ]);
  });

  it('已关闭 → 关闭: 不触发任何写命令 (幂等)', async () => {
    const mock = createMockExecutor(false);
    const autolaunch = createAutolaunch({ reg: mock.reg, appPath: APP_PATH });

    await autolaunch.setEnabled(false);

    expect(mock.getEnabled()).toBe(false);
    expect(mock.calls).toEqual([
      { op: 'query', args: [AUTOLAUNCH_RUN_KEY, AUTOLAUNCH_VALUE_NAME] },
    ]);
  });
});

describe('createAutolaunch — 参数透传', () => {
  it('isEnabled 透传注册表查询结果', async () => {
    const mock = createMockExecutor(true);
    const autolaunch = createAutolaunch({ reg: mock.reg, appPath: APP_PATH });

    await expect(autolaunch.isEnabled()).resolves.toBe(true);
  });

  it('自定义 key / valueName 透传到注册表命令', async () => {
    const mock = createMockExecutor(false);
    const autolaunch = createAutolaunch({
      reg: mock.reg,
      appPath: APP_PATH,
      key: 'HKCU\\Software\\Custom\\Run',
      valueName: 'custom-app',
    });

    await autolaunch.setEnabled(true);

    expect(mock.calls).toEqual([
      { op: 'query', args: ['HKCU\\Software\\Custom\\Run', 'custom-app'] },
      { op: 'add', args: ['HKCU\\Software\\Custom\\Run', 'custom-app', buildRunCommand(APP_PATH)] },
    ]);
  });
});

describe('createRegExecutor — reg 退出码映射', () => {
  it('query: exit 0 → true (值存在)', async () => {
    const executor = createRegExecutor(async () => 0);
    await expect(executor.query(AUTOLAUNCH_RUN_KEY, AUTOLAUNCH_VALUE_NAME)).resolves.toBe(true);
  });

  it('query: exit 1 → false (值不存在)', async () => {
    const executor = createRegExecutor(async () => 1);
    await expect(executor.query(AUTOLAUNCH_RUN_KEY, AUTOLAUNCH_VALUE_NAME)).resolves.toBe(false);
  });

  it('query: 其它退出码 → 抛错', async () => {
    const executor = createRegExecutor(async () => 87);
    await expect(executor.query(AUTOLAUNCH_RUN_KEY, AUTOLAUNCH_VALUE_NAME)).rejects.toThrow(/意外退出/);
  });

  it('add: 非 0 退出码 → 抛错', async () => {
    const executor = createRegExecutor(async () => 5);
    await expect(
      executor.add(AUTOLAUNCH_RUN_KEY, AUTOLAUNCH_VALUE_NAME, 'x'),
    ).rejects.toThrow(/失败/);
  });

  it('delete: exit 1 (值本就不存在) → 视为成功 (幂等删除)', async () => {
    const executor = createRegExecutor(async () => 1);
    await expect(
      executor.delete(AUTOLAUNCH_RUN_KEY, AUTOLAUNCH_VALUE_NAME),
    ).resolves.toBeUndefined();
  });
});

describe('reg 命令行参数构造', () => {
  it('buildAddArgs: /v 值名 /t REG_SZ /d 命令 /f', () => {
    expect(buildAddArgs(AUTOLAUNCH_RUN_KEY, AUTOLAUNCH_VALUE_NAME, '"C:\\app.exe"')).toEqual([
      AUTOLAUNCH_RUN_KEY,
      '/v',
      AUTOLAUNCH_VALUE_NAME,
      '/t',
      'REG_SZ',
      '/d',
      '"C:\\app.exe"',
      '/f',
    ]);
  });

  it('buildDeleteArgs: /v 值名 /f', () => {
    expect(buildDeleteArgs(AUTOLAUNCH_RUN_KEY, AUTOLAUNCH_VALUE_NAME)).toEqual([
      AUTOLAUNCH_RUN_KEY,
      '/v',
      AUTOLAUNCH_VALUE_NAME,
      '/f',
    ]);
  });

  it('buildQueryArgs: /v 值名', () => {
    expect(buildQueryArgs(AUTOLAUNCH_RUN_KEY, AUTOLAUNCH_VALUE_NAME)).toEqual([
      AUTOLAUNCH_RUN_KEY,
      '/v',
      AUTOLAUNCH_VALUE_NAME,
    ]);
  });
});
