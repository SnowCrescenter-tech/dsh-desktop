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
    logger: {
        warn(...args: unknown[]): void;
    };
}
export interface Config {
    /** 是否启用 Web → 原生 通知助手（默认 true） */
    notify: boolean;
}
/** 插件名（Cordis 约定） */
export declare const name = "desktop-client";
/** 依赖的 Cordis 服务（Cordis 约定） */
export declare const inject: string[];
/**
 * 标准 Schema 校验器（StandardSchemaV1）：把任意输入收敛为 `{ notify: boolean }`。
 * 保持零运行时依赖，故手写极简校验而非引入 schemastery。
 */
export declare const Config: {
    '~standard': {
        version: number;
        vendor: string;
        validate(value: unknown): {
            issues: {
                message: string;
            }[];
            value?: undefined;
        } | {
            value: Config;
            issues?: undefined;
        };
    };
};
/** 托盘 → Web 命令（与 src/shared/contract.ts 的 WebCommand 保持一致） */
export type WebCommand = {
    command: 'show-about';
} | {
    command: 'reload';
};
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
export declare function resolveBridge(): DesktopBridge | null;
/**
 * 插件入口。Cordis 在加载时调用 apply(ctx, config)。
 * 用 ctx.slots.inject('root', …) 挂接生命周期：根槽位声明期间安装桥接，
 * 根槽位卸载时对称清理。
 */
export declare function apply(ctx: PluginContext, config: Config): void;
