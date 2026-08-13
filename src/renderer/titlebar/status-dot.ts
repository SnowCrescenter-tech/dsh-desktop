/**
 * 状态点色调映射 —— 纯函数,无 DOM 依赖,便于单元测试。
 *
 * 设计规范 §3.1:
 *   - running  → accent-teal (本地服务运行中,常驻稳态)
 *   - starting → text-tertiary (启动中/服务未就绪)
 *   - stopped  → text-tertiary (已停止/尚未启动,同"未就绪")
 *   - error    → error (服务异常)
 *
 * `ServiceStatus` 的判别联合穷举映射;新增 phase 时这里会出现编译错误,
 * 强制补齐映射 (switch 无 default,TS 穷举校验)。
 */

import type { ServiceStatus } from '../../shared/contract.js';

/** 状态点可取的视觉色调;由 CSS 选择器 [data-tone=...] 消费 */
export type StatusDotTone = 'running' | 'starting' | 'error';

export function statusDotTone(state: ServiceStatus): StatusDotTone {
  switch (state.phase) {
    case 'running':
      return 'running';
    case 'error':
      return 'error';
    case 'starting':
    case 'stopped':
      return 'starting';
  }
}
