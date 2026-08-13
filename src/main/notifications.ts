/**
 * dsh-desktop 原生通知 —— 对 Electron `Notification` 的一层安全包装。
 *
 * 三重门控 (自上而下):
 *   1. 应用未 ready 时静默放弃 (通知中心此时不可用, 强行弹出会失败);
 *   2. Windows 原生通知依赖 AppUserModelID, 缺失时先补齐再弹;
 *   3. 系统不支持原生通知 (`Notification.isSupported() === false`, 如部分
 *      Linux 环境) 时降级为托盘气泡 (displayBalloon, 由组合根注入)。
 */
import { app, Notification } from 'electron';

/** 默认 AppUserModelID (Windows 通知与应用识别) */
export const DEFAULT_APP_USER_MODEL_ID = 'dsh-desktop';

/** 通知负载 (与契约 `native.notify` 的形状一致) */
export interface NotificationOptions {
  /** 通知标题 */
  title: string;
  /** 通知正文 */
  body: string;
}

/** 通知服务 */
export interface Notifier {
  /** 发送通知; 各门控不满足时静默降级/放弃 */
  notify(options: NotificationOptions): void;
}

export interface NotifierDeps {
  /** 应用是否已 ready, 默认 `app.isReady()` */
  isReady?: () => boolean;
  /** 系统是否支持原生通知, 默认 `Notification.isSupported()` */
  isSupported?: () => boolean;
  /** 托盘气泡降级路径 (Windows `displayBalloon` 由组合根注入) */
  showBalloon?: (options: NotificationOptions) => void;
  /** AppUserModelID, 默认 `DEFAULT_APP_USER_MODEL_ID` */
  appUserModelId?: string;
}

export function createNotifier(deps: NotifierDeps = {}): Notifier {
  const isReady = deps.isReady ?? (() => app.isReady());
  const isSupported = deps.isSupported ?? (() => Notification.isSupported());
  const showBalloon = deps.showBalloon ?? (() => {});
  // Electron 43 无 getAppUserModelId 读取器, 用本标志记忆是否已补齐 AppUserModelID
  let appUserModelIdSet = false;

  return {
    notify(options) {
      // 门控 1: 应用未 ready 时通知中心不可用, 静默放弃
      if (!isReady()) {
        return;
      }
      if (isSupported()) {
        // 门控 2: Windows 原生通知依赖 AppUserModelID, 未设置时先补齐再弹
        if (process.platform === 'win32' && !appUserModelIdSet) {
          app.setAppUserModelId(deps.appUserModelId ?? DEFAULT_APP_USER_MODEL_ID);
          appUserModelIdSet = true;
        }
        new Notification({ title: options.title, body: options.body }).show();
        return;
      }
      // 门控 3: 系统不支持原生通知时降级为托盘气泡
      showBalloon(options);
    },
  };
}
