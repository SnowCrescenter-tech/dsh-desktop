/**
 * winver 版本探测测试 —— build 号解析与 Win11 圆角判定 (设计规范 §3.1)。
 *
 * 关键不变量:
 *   - 仅 Win32 且 build ≥ 22000 (Win11) 才启用圆角;
 *   - Win10 最高 build 19045 → 必须 false; 非 Windows 平台 → 永远 false;
 *   - 非法版本串 / 非 10.0 开头的版本串 → 解析失败 (null)。
 */
import { describe, expect, it } from 'vitest';

import {
  parseWindowsBuildNumber,
  shouldRoundCorners,
  WIN11_MIN_BUILD,
} from '../winver.js';

describe('parseWindowsBuildNumber — build 号解析', () => {
  it('Win11 版本串 (10.0.22631) 解析出真实 build 号', () => {
    expect(parseWindowsBuildNumber('10.0.22631')).toBe(22631);
  });

  it('带补丁号的后缀被忽略 (10.0.22631.4317)', () => {
    expect(parseWindowsBuildNumber('10.0.22631.4317')).toBe(22631);
  });

  it('Win10 版本串 (10.0.19045) 解析出 19045', () => {
    expect(parseWindowsBuildNumber('10.0.19045')).toBe(19045);
  });

  it('Win8.1 及更早 (6.3.9600) 返回 null (非 10.0 开头)', () => {
    expect(parseWindowsBuildNumber('6.3.9600')).toBeNull();
  });

  it('非法版本串返回 null', () => {
    expect(parseWindowsBuildNumber('')).toBeNull();
    expect(parseWindowsBuildNumber('not-a-version')).toBeNull();
    expect(parseWindowsBuildNumber('10.0')).toBeNull();
    expect(parseWindowsBuildNumber('10.0.x')).toBeNull();
  });
});

describe('shouldRoundCorners — Win11 圆角开关', () => {
  it('Win32 + build ≥ 22000 启用圆角 (Win11)', () => {
    expect(
      shouldRoundCorners({ platform: 'win32', release: '10.0.22631' }),
    ).toBe(true);
    expect(
      shouldRoundCorners({ platform: 'win32', release: `10.0.${WIN11_MIN_BUILD}` }),
    ).toBe(true);
  });

  it('Win32 + build < 22000 关闭圆角 (Win10)', () => {
    expect(
      shouldRoundCorners({ platform: 'win32', release: '10.0.19045' }),
    ).toBe(false);
    expect(
      shouldRoundCorners({ platform: 'win32', release: '10.0.19045.1234' }),
    ).toBe(false);
  });

  it('非 Windows 平台即使 build 达标也关闭圆角', () => {
    expect(
      shouldRoundCorners({ platform: 'darwin', release: '10.0.22631' }),
    ).toBe(false);
    expect(
      shouldRoundCorners({ platform: 'linux', release: '10.0.22631' }),
    ).toBe(false);
  });

  it('Win32 但版本串解析失败时关闭圆角', () => {
    expect(shouldRoundCorners({ platform: 'win32', release: '' })).toBe(false);
    expect(shouldRoundCorners({ platform: 'win32', release: '6.3.9600' })).toBe(false);
  });
});
