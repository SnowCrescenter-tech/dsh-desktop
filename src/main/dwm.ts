/**
 * DWM 窗口圆角 —— 通过 FFI (koffi) 调用 dwmapi.dll 的
 * DwmSetWindowAttribute(DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND)。
 *
 * 设计规范 §2.3/§6.7: 窗口圆角交给 DWM 原生处理, 零渲染成本。
 * koffi 是可选依赖 (依赖清单中声明, 打包时随 asar 内置): 采用延迟 require,
 * 加载失败 (未安装/平台不支持) 时优雅降级为 null —— 圆角仅影响外观,
 * 不影响功能。调用方通过注入的 setter 完成单元测试。
 */
import { createRequire } from 'node:module';

/** DWMWA_WINDOW_CORNER_PREFERENCE (dwmapi.h) */
export const DWMWA_WINDOW_CORNER_PREFERENCE = 33;

/** DWMWCP_ROUND —— 圆角 (Win11 默认外观) */
export const DWMWCP_ROUND = 2;

/** 设置 DWM 窗口圆角偏好: 入参为 HWND Buffer, 返回 HRESULT */
export type CornerPreferenceSetter = (hwnd: Buffer) => number;

/* koffi 的最小类型面: 只声明运行时用到的成员, 不依赖其完整 .d.ts */
interface KoffiDwmFunction {
  (...args: unknown[]): number;
}
interface KoffiDwmapiLib {
  func(
    name: string,
    returnType: string,
    argTypes: readonly unknown[],
  ): KoffiDwmFunction;
}
interface KoffiLike {
  load(libraryName: string): KoffiDwmapiLib;
}

const require = createRequire(import.meta.url);

/**
 * 延迟加载 koffi (CJS 包, module.exports 即 koffi 对象)。
 * 未安装或加载异常时返回 null, 调用方据此降级跳过圆角。
 */
export function loadKoffi(): KoffiLike | null {
  try {
    return require('koffi') as KoffiLike;
  } catch {
    return null;
  }
}

/**
 * 绑定 DwmSetWindowAttribute 为类型化的 CornerPreferenceSetter。
 * 绑定失败 (dwmapi.dll 加载失败等) 返回 null。koffi 缺失时调用方应先用
 * loadKoffi() 探测并降级。
 */
export function createCornerPreferenceSetter(koffi: KoffiLike): CornerPreferenceSetter | null {
  try {
    const dwmapi = koffi.load('dwmapi.dll');
    const setAttribute = dwmapi.func('DwmSetWindowAttribute', 'int', [
      'void*', // hwnd —— 传 HWND Buffer, koffi 自动取其地址
      'uint', // dwAttribute
      'void*', // pvAttribute —— 指向 4 字节偏好值的缓冲
      'uint', // cbAttribute
    ]);
    return (hwnd: Buffer): number => {
      const preference = new Uint32Array([DWMWCP_ROUND]);
      return setAttribute(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, preference, 4);
    };
  } catch {
    return null;
  }
}
