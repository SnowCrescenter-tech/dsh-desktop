/**
 * @dsh-desktop/client —— dsh 浏览器侧桌面桥接插件。
 *
 * 随 desktop profile 加载进 DeepSeek Harness 的 Web UI，负责在原生 Electron 壳
 * 与 Web 页面之间架桥：
 *   - 原生 → Web：暴露托盘命令处理器，preload 在收到主进程广播时调用它路由命令。
 *   - Web → 原生：暴露 notifyNative() 助手，让页面能发送 Windows 原生通知。
 * 本插件不注入任何视觉样式；在纯浏览器环境（无 window.dshDesktop）下优雅降级。
 *
 * Cordis 约定（与 dsh-web-app 等 bundle 一致）：导出 name / inject / Config / apply。
 * 结构化类型避免在浏览器侧引入完整 cordis 运行时 —— 真实 Context 由宿主提供，
 * 结构上满足这里声明的接口即可。
 */

/* ------------------------------------------------------------------ */
/* 结构化类型（宿主 @deepseek-ai/cordis 提供真实实现）                 */
/* ------------------------------------------------------------------ */

/** 槽位服务的最小结构子集 */
export interface SlotsService {
  /**
   * 仅当 Web UI 暴露了指定槽位时挂接一个生命周期副作用。
   * 回调返回的清理函数在槽位声明卸载时执行（对称销毁）。
   * @returns 取消注入的函数
   */
  inject(key: string, callback: () => () => void): () => void;
}

/** 插件上下文的最小结构子集 */
export interface PluginContext {
  slots: SlotsService;
  logger: { warn(...args: unknown[]): void };
}

/* ------------------------------------------------------------------ */
/* 配置                                                                */
/* ------------------------------------------------------------------ */

export interface Config {
  /** 是否启用 Web → 原生 通知助手（默认 true） */
  notify: boolean;
}

/** 插件名（Cordis 约定） */
export const name = 'desktop-client';

/** 依赖的 Cordis 服务（Cordis 约定） */
export const inject = ['slots'];

/**
 * 标准 Schema 校验器（StandardSchemaV1）：把任意输入收敛为 `{ notify: boolean }`。
 * 保持零运行时依赖，故手写极简校验而非引入 schemastery。
 */
export const Config = {
  '~standard': {
    version: 1,
    vendor: '@dsh-desktop/client',
    validate(value: unknown) {
      if (typeof value !== 'object' || value === null) {
        return { issues: [{ message: '配置必须是对象' }] };
      }
      const input = value as Record<string, unknown>;
      const notify = typeof input.notify === 'boolean' ? input.notify : true;
      return { value: { notify } as Config };
    },
  },
};

/* ------------------------------------------------------------------ */
/* 桥接                                                                */
/* ------------------------------------------------------------------ */

/** 托盘 → Web 命令（与 src/shared/contract.ts 的 WebCommand 保持一致） */
export type WebCommand = { command: 'show-about' } | { command: 'reload' };

/** 通知负载 */
export interface NotificationPayload {
  title: string;
  body: string;
}

/** preload 注入的桥接 API 的最小结构子集 */
export interface DesktopBridge {
  native?: {
    notify?(payload: NotificationPayload): Promise<void>;
  };
}

/**
 * 从全局取 window.dshDesktop；不存在则返回 null（纯浏览器环境）。
 */
export function resolveBridge(): DesktopBridge | null {
  const w = globalThis as { dshDesktop?: DesktopBridge };
  return w.dshDesktop ?? null;
}

/**
 * 暴露到全局的托盘命令处理器。preload 在收到主进程广播时调用它，
 * 把命令路由给页面。返回一个 cleanup，供槽位卸载时对称移除。
 */
function installTrayHandler(): () => void {
  const w = globalThis as {
    __dshDesktopCommand__?: (command: WebCommand) => void;
    __dshDesktopAboutHandlers__?: Array<() => void>;
  };
  w.__dshDesktopCommand__ = (command: WebCommand) => {
    switch (command.command) {
      case 'show-about':
        // 无视觉样式：通过全局处理器注册表派发（避免依赖浏览器 CustomEvent，
        // 在纯浏览器 / Node 测试环境下均可工作）
        for (const handler of w.__dshDesktopAboutHandlers__ ?? []) {
          handler();
        }
        break;
      case 'reload': {
        // 可选链：Node 测试环境下 location 可能不存在
        const location = (globalThis as { location?: { reload?: () => void } }).location;
        location?.reload?.();
        break;
      }
      default: {
        // 判别联合穷举保护
        const never: never = command;
        void never;
      }
    }
  };
  return () => {
    delete w.__dshDesktopCommand__;
  };
}

/**
 * 暴露 Web → 原生 通知助手到全局。
 */
function installNotifyHelper(bridge: DesktopBridge): () => void {
  const notify = bridge.native?.notify;
  const w = globalThis as {
    dshDesktopNotify?: (payload: NotificationPayload) => Promise<void>;
  };
  w.dshDesktopNotify = (payload: NotificationPayload) =>
    notify ? notify(payload) : Promise.resolve();
  return () => {
    delete w.dshDesktopNotify;
  };
}

/**
 * 插件入口。Cordis 在加载时调用 apply(ctx, config)。
 * 用 ctx.slots.inject('root', …) 挂接生命周期：根槽位声明期间安装桥接，
 * 根槽位卸载时对称清理。
 */
export function apply(ctx: PluginContext, config: Config): void {
  const bridge = resolveBridge();
  if (bridge === null) {
    ctx.logger.warn('window.dshDesktop 不存在：桌面桥接降级为纯浏览器模式');
    return;
  }

  ctx.slots.inject('root', () => {
    const removeTrayHandler = installTrayHandler();
    const removeNotifyHelper = config.notify ? installNotifyHelper(bridge) : null;
    return () => {
      removeTrayHandler();
      removeNotifyHelper?.();
    };
  });
}
