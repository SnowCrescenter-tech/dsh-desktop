/**
 * dsh-desktop 自动更新 (electron-updater 的 DI 包装) —— T18。
 *
 * 职责边界:
 *   - 本模块只编排 electron-updater (检查 / 下载 / 安装) 与用户侧反馈
 *     (原生通知 / 打开 GitHub Releases 页), 不关心窗口与托盘实现细节;
 *   - 全部依赖可注入 (autoUpdater / notifier / shell / logger / isInstaller),
 *     测试用 plain-object fake 驱动, 与 window.ts / ipc.ts 同款分层;
 *   - 两种安装形态由 app-update.yml 是否存在区分 —— electron-builder 只为
 *     nsis 目标生成该文件 (PublishManager.isSuitableWindowsTarget), 便携 zip 没有:
 *       * NSIS 安装器: autoDownload=true → 后台自动下载 → update-downloaded →
 *         原生通知"新版本已就绪, 重启后自动更新" → 托盘"重启并更新"调 quitAndInstall;
 *       * 便携 zip: electron-updater 无 app-update.yml 直接不可用
 *         (checkForUpdates 必抛 ERR_UPDATER_DISABLED), 因此不调用它 ——
 *         手动检查时通知用户并打开 GitHub Releases 页, 由用户自行下载;
 *   - 无发布配置 / 离线 / 更新被禁用: 一律静默降级为 not-available (仅日志),
 *     任何异常都不向上抛, 永不崩溃 (启动自检也绝不弹窗打扰)。
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type {
  Logger,
  ProgressInfo,
  UpdateCheckResult,
  UpdateDownloadedEvent,
  UpdateInfo,
} from 'electron-updater';

import type { Notifier } from './notifications.js';

/** electron-updater 生成/读取的更新配置文件名 (位于 process.resourcesPath) */
export const APP_UPDATE_YML = 'app-update.yml';

/** GitHub Releases 页面 (便携版更新入口, 与 electron-builder.yml 的 publish 配置对应) */
export const GITHUB_RELEASES_URL = 'https://github.com/SnowCrescenter-tech/dsh-desktop/releases';

/**
 * 运行时更新检查结果 —— `check()` 的返回值。
 * 状态机: not-available → up-to-date / available → ready (安装版自动下载完成后)。
 */
export type UpdateResult =
  /** 无发布配置 / 离线 / 更新被禁用 —— 静默降级, 不打扰用户 */
  | { status: 'not-available' }
  /** 已是最新版本 */
  | { status: 'up-to-date' }
  /** 发现新版本 (安装版: 正在后台下载; 便携版: 已引导用户去 Releases 页) */
  | { status: 'available' }
  /** 新版本已下载完成, 重启即安装 (托盘据此展示"重启并更新") */
  | { status: 'ready' }
  /** 检查失败, message 可展示给用户 */
  | { status: 'error'; message: string };

/**
 * 更新阶段的快照 —— 组合根订阅后用于刷新托盘菜单/提示 (getPhase / onPhaseChange)。
 * 判别联合, 消费方必须穷举 (switch + assertNever)。
 */
export type UpdatePhase =
  /** 尚未执行过任何检查 */
  | { phase: 'idle' }
  /** 检查中 */
  | { phase: 'checking' }
  /** 已是最新 */
  | { phase: 'up-to-date' }
  /** 下载中 (percent 0-100) */
  | { phase: 'downloading'; percent: number }
  /** 已下载完成, 重启即更新 */
  | { phase: 'ready' }
  /** 不可用 (离线 / 无更新源), 静默 */
  | { phase: 'not-available' }
  /** 出错, message 可展示 */
  | { phase: 'error'; message: string };

/**
 * 更新日志接口 —— electron-updater Logger 的必需超集 (debug 也必需, 便于进度日志)。
 * 结构上可赋给 electron-updater 的 Logger (其 debug 可选), 因此能直接接到
 * autoUpdater.logger; 自己定义是为了让 createUpdater 内部直接调用 debug 而无需判空。
 */
export interface UpdateLogger {
  debug(message: string): void;
  info(message?: unknown): void;
  warn(message?: unknown): void;
  error(message?: unknown): void;
}

/**
 * electron-updater 的最小结构接口 —— 只声明本模块用到的方法/字段。
 * 真实 autoUpdater (AppUpdater) 结构上满足它, 测试注入 plain-object fake 即可。
 */
export interface UpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  logger: Logger | null;
  on(event: 'checking-for-update', listener: () => void): void;
  on(event: 'update-available', listener: (info: UpdateInfo) => void): void;
  on(event: 'update-not-available', listener: (info: UpdateInfo) => void): void;
  on(event: 'download-progress', listener: (info: ProgressInfo) => void): void;
  on(event: 'update-downloaded', listener: (info: UpdateDownloadedEvent) => void): void;
  on(event: 'error', listener: (error: Error) => void): void;
  checkForUpdates(): Promise<UpdateCheckResult | null>;
  quitAndInstall(): void;
}

/** 检查选项 */
export interface CheckOptions {
  /**
   * 静默检查: 不弹通知、不打开外部页 (启动后的延迟自检用 true, 托盘手动检查用 false)。
   * 唯一例外: 安装版下载完成后"重启即更新"通知总是弹出 (这是更新就绪的核心提醒)。
   */
  silent?: boolean;
}

/** createUpdater 的依赖 */
export interface UpdaterDeps {
  /** electron-updater 实例 (组合根传真实 autoUpdater, 测试传 fake) */
  autoUpdater: UpdaterLike;
  /** 原生通知 (检查结果反馈 / 更新就绪提醒) */
  notifier: Notifier;
  /** 打开外部链接 (便携版引导去 GitHub Releases 页) */
  shell: { openExternal(url: string): Promise<void> };
  /** 日志 (同时接到 autoUpdater.logger, 便于诊断检查/下载/错误) */
  logger: UpdateLogger;
  /** 是否安装版; 默认: app-update.yml 存在于 process.resourcesPath */
  isInstaller?: () => boolean;
  /** GitHub Releases 页面 URL (便携版更新入口) */
  releasesUrl: string;
}

/** 更新控制器 (createUpdater 的返回值) */
export interface UpdaterController {
  /** 执行一次更新检查; silent=true 时不弹通知/不开页面 (启动自检) */
  check(options?: CheckOptions): Promise<UpdateResult>;
  /** 退出应用并安装已下载的更新 (仅 ready 状态下生效, 其余状态安全忽略) */
  quitAndInstall(): void;
  /** 当前更新阶段的快照 */
  getPhase(): UpdatePhase;
  /** 订阅阶段变化; 返回取消订阅函数 (组合根据此刷新托盘菜单/提示) */
  onPhaseChange(listener: (phase: UpdatePhase) => void): () => void;
}

/** 网络/离线类错误码 (checkForUpdates 在网络不可达时抛出) */
const NETWORK_ERROR_CODES: ReadonlySet<string> = new Set([
  'ENOTFOUND',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ERR_NETWORK',
]);

/** 提取 Error 上的 code 字段 (electron-updater 的错误带 ERR_* 前缀) */
function getErrorCode(error: unknown): string | null {
  if (!(error instanceof Error)) {
    return null;
  }
  const code = (error as Error & { code?: unknown })['code'];
  return typeof code === 'string' ? code : null;
}

/** 无发布配置 / 应用未打包: electron-updater 禁用时的错误特征 */
function isUpdaterDisabled(error: unknown): boolean {
  if (getErrorCode(error) === 'ERR_UPDATER_DISABLED') {
    return true;
  }
  // 兜底: 不同版本 electron-updater 可能直接以文案报错, 按"不可用"处理
  return error instanceof Error && error.message.includes('app-update.yml');
}

/** 离线/禁用类错误 → 一律降级为 not-available (永不视为可展示的 error) */
function isOfflineLike(error: unknown): boolean {
  if (isUpdaterDisabled(error)) {
    return true;
  }
  const code = getErrorCode(error);
  return code !== null && NETWORK_ERROR_CODES.has(code);
}

/**
 * 极简控制台日志 (满足 electron-updater 的 Logger 形状), 打上 [updater] 前缀。
 * 打包应用里无需引入 winston/electron-log —— 检查/下载/错误都经这里可诊断。
 */
export function createUpdateLogger(): UpdateLogger {
  const prefix = '[updater]';
  return {
    debug: (message: string): void => {
      console.debug(prefix, message);
    },
    info: (message?: unknown): void => {
      console.info(prefix, message);
    },
    warn: (message?: unknown): void => {
      console.warn(prefix, message);
    },
    error: (message?: unknown): void => {
      console.error(prefix, message);
    },
  };
}

export function createUpdater(deps: UpdaterDeps): UpdaterController {
  const autoUpdater = deps.autoUpdater;
  // 安装版判定: app-update.yml 存在 = electron-builder 生成了 nsis 发布配置
  const isInstaller =
    deps.isInstaller ??
    (() => {
      const resources = process.resourcesPath;
      if (resources === undefined || resources === '') {
        // 非打包环境 (dev / 测试) 没有 resourcesPath, 一律按便携版处理
        return false;
      }
      return existsSync(join(resources, APP_UPDATE_YML));
    });

  // 事件监听器集合 (阶段变化订阅)
  const phaseListeners = new Set<(phase: UpdatePhase) => void>();
  let phase: UpdatePhase = { phase: 'idle' };

  function setPhase(next: UpdatePhase): void {
    phase = next;
    for (const listener of phaseListeners) {
      listener(next);
    }
  }

  // 把真实 logger 交给 electron-updater (检查/下载/错误都会经它输出)
  autoUpdater.logger = deps.logger;
  // 安装版: 发现更新后自动后台下载; 便携版: 只检查不下载
  autoUpdater.autoDownload = isInstaller();
  autoUpdater.autoInstallOnAppQuit = true;

  /* ------------------------------------------------------------------ */
  /* 事件 → 行为映射 (electron-updater 完整事件面)                          */
  /* ------------------------------------------------------------------ */

  autoUpdater.on('checking-for-update', () => {
    deps.logger.info('正在检查更新…');
    setPhase({ phase: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    deps.logger.info(`发现新版本 ${info.version}`);
  });

  autoUpdater.on('update-not-available', (info) => {
    deps.logger.info(`当前已是最新版本 (${info.version})`);
    setPhase({ phase: 'up-to-date' });
  });

  autoUpdater.on('download-progress', (info) => {
    // 进度事件高频触发, 只记 debug 级日志, 避免刷屏
    deps.logger.debug(`下载进度 ${info.percent.toFixed(1)}%`);
    setPhase({ phase: 'downloading', percent: info.percent });
  });

  autoUpdater.on('update-downloaded', (_info) => {
    deps.logger.info('新版本已下载完成, 重启后自动安装');
    setPhase({ phase: 'ready' });
    // 就绪提醒总是弹出 —— 无论启动自检还是手动检查, 这是最核心的用户通知
    deps.notifier.notify({
      title: 'dsh-desktop 有新版本',
      body: '新版本已就绪，重启后自动更新',
    });
  });

  autoUpdater.on('error', (error) => {
    // 下载期异步错误等: 记录并降级, 绝不向上抛出 (check() 的 catch 再补一条通知)
    deps.logger.error(`更新错误: ${error.message}`);
    setPhase({ phase: 'error', message: error.message });
  });

  /** 便携版引导: 打开 GitHub Releases 页 (失败不影响主流程, 仅告警日志) */
  async function openReleasesPage(): Promise<void> {
    try {
      await deps.shell.openExternal(deps.releasesUrl);
    } catch (error) {
      deps.logger.warn(`打开 Releases 页面失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** 检查失败的统一收口: 分类降级 + 按需通知 + 更新 phase */
  function handleCheckError(error: unknown, silent: boolean): UpdateResult {
    const message = error instanceof Error ? error.message : String(error);
    deps.logger.error(`更新检查失败: ${message}`);
    if (isOfflineLike(error)) {
      setPhase({ phase: 'not-available' });
      if (!silent) {
        deps.notifier.notify({
          title: '检查更新',
          body: '暂时无法检查更新（无更新源或离线）',
        });
      }
      return { status: 'not-available' };
    }
    setPhase({ phase: 'error', message });
    if (!silent) {
      deps.notifier.notify({ title: '检查更新失败', body: message });
    }
    return { status: 'error', message };
  }

  async function check(options: CheckOptions = {}): Promise<UpdateResult> {
    const silent = options.silent ?? false;

    // 便携版: 无 app-update.yml → electron-updater 不可用, 不调用它,
    // 手动检查时直接引导用户去 GitHub Releases 页自行下载。
    if (!isInstaller()) {
      deps.logger.info('便携版更新: 跳过自动更新, 请前往 GitHub Releases 手动下载');
      if (!silent) {
        deps.notifier.notify({
          title: '检查更新',
          body: '便携版更新请前往 GitHub Releases 页面下载最新版本',
        });
        void openReleasesPage();
      }
      return { status: 'available' };
    }

    try {
      // 已就绪时重复检查: 保持 ready, 避免把"重启即更新"状态冲掉
      const wasReady = phase.phase === 'ready';
      if (!wasReady) {
        setPhase({ phase: 'checking' });
      }
      const result = await autoUpdater.checkForUpdates();
      if (result === null || !result.isUpdateAvailable) {
        // 已是最新: update-not-available 事件已把 phase 置为 up-to-date
        setPhase({ phase: 'up-to-date' });
        if (!silent) {
          deps.notifier.notify({ title: '检查更新', body: '当前已是最新版本' });
        }
        return { status: 'up-to-date' };
      }

      const version = result.updateInfo.version;
      deps.logger.info(`发现新版本 ${version}, 开始后台下载`);
      if (!silent) {
        deps.notifier.notify({
          title: '检查更新',
          body: `发现新版本 ${version}，正在后台下载`,
        });
      }

      if (result.downloadPromise !== undefined && result.downloadPromise !== null) {
        setPhase({ phase: 'downloading', percent: 0 });
        // 下载完成 → update-downloaded 事件已把 phase 置为 ready 并弹"重启即更新"通知
        await result.downloadPromise;
        // 兜底: 事件与下载完成的先后时序因版本而异, 无论如何最终都落为 ready
        if (phase.phase !== 'ready') {
          setPhase({ phase: 'ready' });
        }
        return { status: 'ready' };
      }
      // downloadPromise 为空: 更新通常已下载完成 (此前已弹就绪通知), 保持 ready
      if (wasReady) {
        return { status: 'ready' };
      }
      return { status: 'available' };
    } catch (error) {
      return handleCheckError(error, silent);
    }
  }

  function quitAndInstall(): void {
    if (phase.phase !== 'ready') {
      // 安全护栏: 无就绪更新时不执行 (托盘菜单也只在 ready 时展示该入口)
      deps.logger.warn('quitAndInstall 被调用但更新尚未就绪, 已忽略');
      return;
    }
    deps.logger.info('退出应用并安装更新');
    autoUpdater.quitAndInstall();
  }

  return {
    check,
    quitAndInstall,
    getPhase: () => phase,
    onPhaseChange(listener) {
      phaseListeners.add(listener);
      return () => {
        phaseListeners.delete(listener);
      };
    },
  };
}
