/**
 * Windows 版本探测 —— 决定是否启用 DWM 原生圆角 (设计规范 §3.1 / §2.3)。
 *
 * Windows 11 的 build ≥ 22000, Windows 10 最高 build 为 19045, 两者互不重叠,
 * 因此仅凭 build 号即可区分 Win10 / Win11。Node 的 os.release() 在 Windows 上
 * 返回形如 "10.0.22631" 的版本串 (Electron 主进程二进制携带 Windows 10+
 * 兼容 manifest, GetVersionEx 返回真实版本), 解析第三段 build 号即可 ——
 * 零原生依赖、同步、类型安全, 也便于测试注入。
 */
import { release } from 'node:os';

/** Windows 11 的首个 build 号 (22000.1) */
export const WIN11_MIN_BUILD = 22000;

/** 版本探测的可注入依赖 (测试用) */
export interface WinVersionDeps {
  /** 当前平台, 默认 process.platform */
  platform?: NodeJS.Platform;
  /** os.release() 返回值, 默认 node:os release() */
  release?: string;
}

/**
 * 从 Windows 版本串解析 build 号。
 * 形如 "10.0.22631.4317" → 22631; 非 Win10/11 版本串或解析失败返回 null。
 */
export function parseWindowsBuildNumber(version: string): number | null {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (match === null) {
    return null;
  }
  const major = Number(match[1]);
  if (major < 10) {
    return null; // Win10/11 版本串均以 10.0 开头 (Win8.1 为 6.3)
  }
  const buildText = match[3];
  if (buildText === undefined) {
    return null;
  }
  const build = Number(buildText);
  return Number.isInteger(build) && build >= 0 ? build : null;
}

/**
 * 是否应启用 DWM 圆角: 仅 Win32 且 build ≥ 22000 (Win11)。
 * Win10 (build < 22000) 与其它平台一律返回 false —— 保持系统默认方角。
 */
export function shouldRoundCorners(deps: WinVersionDeps = {}): boolean {
  if ((deps.platform ?? process.platform) !== 'win32') {
    return false;
  }
  const build = parseWindowsBuildNumber(deps.release ?? release());
  return build !== null && build >= WIN11_MIN_BUILD;
}
