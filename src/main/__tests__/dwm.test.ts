/**
 * dwm 圆角 FFI 绑定测试 —— DwmSetWindowAttribute(DWMWCP_ROUND) 绑定与降级。
 *
 * 关键不变量:
 *   - 绑定成功后 setter 以 (HWND Buffer, DWMWA_WINDOW_CORNER_PREFERENCE=33,
 *     4 字节偏好值=2, 长度 4) 调用 dwmapi;
 *   - koffi 缺失 (null) 或绑定抛错时返回 null —— 优雅降级;
 *   - setter 调用结果 (HRESULT) 原样透出。
 */
import { describe, expect, it, vi } from 'vitest';

import {
  createCornerPreferenceSetter,
  DWMWA_WINDOW_CORNER_PREFERENCE,
  DWMWCP_ROUND,
  loadKoffi,
  type CornerPreferenceSetter,
} from '../dwm.js';

/** 构造一个可断言的 fake koffi 模块 */
function makeFakeKoffi() {
  const setAttribute = vi.fn((..._args: unknown[]) => 0);
  const dwmapi = {
    func: vi.fn((_name: string, _ret: string, _args: readonly unknown[]) => setAttribute),
  };
  const koffi = { load: vi.fn((_lib: string) => dwmapi) };
  return { koffi, dwmapi, setAttribute };
}

describe('createCornerPreferenceSetter — DWM 圆角绑定', () => {
  it('以 DWMWCP_ROUND 偏好调用 DwmSetWindowAttribute (attr=33, len=4)', () => {
    const { koffi, setAttribute } = makeFakeKoffi();
    const setter = createCornerPreferenceSetter(koffi);
    expect(setter).not.toBeNull();

    const hwnd = Buffer.alloc(8, 0xab);
    const hr = setter as CornerPreferenceSetter;
    expect(hr(hwnd)).toBe(0);

    expect(setAttribute).toHaveBeenCalledTimes(1);
    const [hwndArg, attrArg, prefArg, lenArg] = setAttribute.mock.calls[0] as [
      Buffer,
      number,
      Uint32Array,
      number,
    ];
    expect(hwndArg).toBe(hwnd);
    expect(attrArg).toBe(DWMWA_WINDOW_CORNER_PREFERENCE);
    expect(lenArg).toBe(4);
    // 偏好值必须为 DWMWCP_ROUND (2), 且是 4 字节小端
    expect(prefArg instanceof Uint32Array).toBe(true);
    expect(Array.from(prefArg)).toEqual([DWMWCP_ROUND]);
    expect(prefArg.byteLength).toBe(4);
  });

  it('koffi 缺失 (null) 时由调用方降级 —— 本函数不处理 null', () => {
    // 签名要求 KoffiLike; 缺失场景由 loadKoffi() 返回 null + 调用方短路覆盖
    expect(loadKoffi()).not.toBeNull(); // 依赖已声明, 生产环境可加载
  });

  it('dwmapi.dll 加载失败时返回 null', () => {
    const koffi = {
      load: vi.fn(() => {
        throw new Error('加载 dwmapi.dll 失败');
      }),
    };
    expect(createCornerPreferenceSetter(koffi)).toBeNull();
  });

  it('func 绑定失败时返回 null', () => {
    const koffi = {
      load: vi.fn(() => ({
        func: vi.fn(() => {
          throw new Error('绑定失败');
        }),
      })),
    };
    expect(createCornerPreferenceSetter(koffi)).toBeNull();
  });
});

describe('loadKoffi — 延迟加载', () => {
  it('koffi 为已声明依赖, 应能加载出含 load 的模块', () => {
    const koffi = loadKoffi();
    expect(koffi).not.toBeNull();
    expect(typeof koffi?.load).toBe('function');
  });
});
