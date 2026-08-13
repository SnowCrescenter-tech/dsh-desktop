/**
 * IPC 契约一致性测试 —— 单一事实来源 (src/shared/contract.ts)。
 *
 * 守护两条不变量:
 *   1. 全部 IPC 通道字符串全局唯一 —— 重复定义会被 ipcRenderer 静默覆盖,
 *      必须由测试在合并前拦截;
 *   2. `DshDesktop` 接口成员与通道常量一一对应 —— 接口演化 (增删成员)
 *      不得脱离契约, 反之亦然。
 */
import { describe, expect, it } from 'vitest';

import { ipcChannelList, ipcChannels, type DshDesktop } from '../contract.js';

/** camelCase → kebab-case (`getState` → `get-state`), 用于成员名 ↔ 通道名对应 */
const kebab = (name: string): string =>
  name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);

/**
 * 编译期断言: 此清单必须与 `DshDesktop` 接口完全一致。
 * 接口新增/删除成员、或清单写错, 都会在这里报类型错误 (satisfies 双向校验)。
 */
const interfaceSurface = {
  window: ['minimize', 'maximize', 'unmaximize', 'close', 'getState'],
  status: ['onState'],
  onboarding: ['submitKey', 'dismiss'],
  autolaunch: ['get', 'set'],
  native: ['notify'],
  web: ['broadcast'],
} as const satisfies { [K in keyof DshDesktop]: readonly (keyof DshDesktop[K])[] };

/** 递归收集嵌套 channel 对象的所有叶子值 (即全部通道字符串) */
function collectChannelValues(group: object): string[] {
  const values: string[] = [];
  for (const value of Object.values(group)) {
    if (typeof value === 'string') {
      values.push(value);
    } else if (typeof value === 'object' && value !== null) {
      values.push(...collectChannelValues(value));
    }
  }
  return values;
}

describe('IPC 通道契约', () => {
  it('全部通道字符串全局唯一', () => {
    const channels = collectChannelValues(ipcChannels);
    expect(channels.length).toBeGreaterThan(0);
    expect(new Set(channels).size).toBe(channels.length);
  });

  it('扁平通道列表与嵌套结构完全一致 (防止登记遗漏)', () => {
    const nested = collectChannelValues(ipcChannels).sort();
    expect([...ipcChannelList].sort()).toEqual(nested);
  });

  it('通道命名空间与接口分组一一对应', () => {
    const groups = Object.keys(interfaceSurface).sort();
    expect(Object.keys(ipcChannels).sort()).toEqual(groups);
  });

  it('每个分组的通道值与接口成员一一对应 (命名空间:成员-kebab)', () => {
    for (const [group, members] of Object.entries(interfaceSurface)) {
      const expected = new Set(
        members.map((member) => `${group}:${kebab(member)}`),
      );
      const actual = new Set(
        Object.values(ipcChannels[group as keyof typeof ipcChannels]),
      );
      expect(actual).toEqual(expected);
    }
  });

  it('通道总数与接口成员总数一致', () => {
    const memberCount = Object.values(interfaceSurface).reduce(
      (total, members) => total + members.length,
      0,
    );
    expect(ipcChannelList.length).toBe(memberCount);
  });
});
