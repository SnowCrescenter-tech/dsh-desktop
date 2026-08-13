/**
 * `window.dshDesktop` 的全局类型声明 (ambient)。
 *
 * 让渲染层 (标题栏、引导对话框, 及未来的浏览器侧 dsh 客户端插件) 无需 import
 * 即可访问 `window.dshDesktop`, 且形状与 src/shared/contract.ts 的 `DshDesktop`
 * 接口完全一致 —— 契约变更时此处类型自动跟随。
 */
import type { DshDesktop } from '../shared/contract.js';

declare global {
  interface Window {
    /** preload 注入的桌面桥接 API (只读, 由 contextBridge 冻结代理) */
    readonly dshDesktop: DshDesktop;
  }
}

export {};
