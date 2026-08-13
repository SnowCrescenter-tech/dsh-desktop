/**
 * dsh-desktop 主进程 ↔ 渲染进程 IPC 契约 —— 单一事实来源 (Single Source of Truth)。
 *
 * 这是 Electron 主进程、preload 桥 (src/preload/index.ts) 与渲染层
 * (标题栏、引导对话框) 之间唯一共享的通道常量与类型定义:
 *   - 通道常量: 每个 IPC 通道字符串在本文件定义且仅定义一次;
 *   - 负载类型: 各 invoke 的参数 / 返回值 / 事件推送的完整形状;
 *   - `DshDesktop` 接口: 暴露到 `window.dshDesktop` 的完整 API 表面。
 *
 * 约定:
 *   - 通道名格式固定为 `命名空间:动作` (kebab-case), 如 `window:get-state`;
 *   - 新增 IPC 必须同时完成: ① 在此新增通道常量, ② 扩展 `DshDesktop` 接口,
 *     ③ 在 `ipcChannelList` 中登记 —— contract.test.ts 会校验三者一致;
 *   - 本文件只定义契约, 不含任何主进程实现 (主进程 handler 见 T15)。
 */

/* ------------------------------------------------------------------ */
/* 窗口控制 (标题栏按钮区, 设计规范 §3.1)                                  */
/* ------------------------------------------------------------------ */

export const windowChannels = {
  /** 最小化窗口 */
  minimize: 'window:minimize',
  /** 最大化窗口 */
  maximize: 'window:maximize',
  /** 还原窗口 (取消最大化) */
  unmaximize: 'window:unmaximize',
  /** 关闭窗口 (按设计规范 §3.3, 行为 = 隐藏到托盘) */
  close: 'window:close',
  /** 拉取当前窗口状态 */
  getState: 'window:get-state',
} as const;

/* ------------------------------------------------------------------ */
/* 服务状态订阅 (标题栏状态点, 设计规范 §3.1)                              */
/* ------------------------------------------------------------------ */

export const statusChannels = {
  /** 推送本地服务状态变化 */
  onState: 'status:on-state',
} as const;

/* ------------------------------------------------------------------ */
/* 首次运行引导 (设计规范 §4)                                            */
/* ------------------------------------------------------------------ */

export const onboardingChannels = {
  /** 提交 API Key 校验并保存 */
  submitKey: 'onboarding:submit-key',
  /**
   * 关闭引导对话框 (ESC / "稍后再说" / 保存成功后的退场落地)。
   * 与 window:close (隐藏到托盘) 语义不同, 仅作用于引导对话框自身。
   */
  dismiss: 'onboarding:dismiss',
} as const;

/* ------------------------------------------------------------------ */
/* 开机自启 (托盘复选菜单)                                               */
/* ------------------------------------------------------------------ */

export const autolaunchChannels = {
  /** 查询是否已启用开机自启 */
  get: 'autolaunch:get',
  /** 设置开机自启 */
  set: 'autolaunch:set',
} as const;

/* ------------------------------------------------------------------ */
/* 原生能力                                                            */
/* ------------------------------------------------------------------ */

export const nativeChannels = {
  /** 发送 Windows 原生通知 */
  notify: 'native:notify',
} as const;

/* ------------------------------------------------------------------ */
/* 托盘 → Web 广播                                                       */
/* ------------------------------------------------------------------ */

export const webChannels = {
  /** 广播托盘命令给 Web 渲染进程 */
  broadcast: 'web:broadcast',
} as const;

/**
 * 全部 IPC 通道的分组聚合 —— 结构即 `DshDesktop` 接口的分组映射。
 * 通道字符串本体只在上面各分组常量中定义一次, 此处仅做引用。
 */
export const ipcChannels = {
  window: windowChannels,
  status: statusChannels,
  onboarding: onboardingChannels,
  autolaunch: autolaunchChannels,
  native: nativeChannels,
  web: webChannels,
} as const;

/**
 * 全部 IPC 通道的扁平列表 (按接口成员顺序排列)。
 * 供主进程一次性注册 / 校验, 以及契约测试做去重断言。
 */
export const ipcChannelList = [
  windowChannels.minimize,
  windowChannels.maximize,
  windowChannels.unmaximize,
  windowChannels.close,
  windowChannels.getState,
  statusChannels.onState,
  onboardingChannels.submitKey,
  onboardingChannels.dismiss,
  autolaunchChannels.get,
  autolaunchChannels.set,
  nativeChannels.notify,
  webChannels.broadcast,
] as const;

/* ------------------------------------------------------------------ */
/* 负载类型                                                             */
/* ------------------------------------------------------------------ */

/** 窗口状态 —— `window.getState()` 的返回值 */
export interface WindowState {
  /** 当前是否处于最大化 (标题栏据此切换 "□" / "❐" 字形) */
  maximized: boolean;
  /** 当前窗口是否聚焦 (未激活时标题栏整体降为 text-tertiary, §3.1) */
  focused: boolean;
  /** 当前窗口是否可见 (false = 已关闭到托盘, §3.3) */
  visible: boolean;
}

/**
 * 本地 DeepSeek Harness 服务状态 —— `status.onState` 的推送负载。
 * 渲染层据此渲染标题栏状态点: starting → tertiary / running → teal / error → error。
 */
export type ServiceStatus =
  /** 启动中 (服务未就绪) */
  | { phase: 'starting' }
  /** 运行中 (携带 Web UI 访问地址) */
  | { phase: 'running'; url: string }
  /** 启动失败或运行异常 (message 可展示给用户) */
  | { phase: 'error'; message: string }
  /** 已停止 (退出前/尚未启动) */
  | { phase: 'stopped' };

/** `onboarding.submitKey` 的请求负载 */
export interface SubmitKeyPayload {
  /** DeepSeek API Key (sk- 开头) */
  key: string;
}

/** `onboarding.submitKey` 的返回值 —— 校验结果 */
export type SubmitKeyResult =
  /** 校验通过并已持久化到本机 */
  | { ok: true }
  /** 校验失败, error 为可展示给用户的失败原因 */
  | { ok: false; error: string };

/** `autolaunch.set` 的请求负载 */
export interface SetAutolaunchPayload {
  /** 是否启用开机自启 */
  enabled: boolean;
}

/** `native.notify` 的请求负载 —— Windows 原生通知 */
export interface NotificationPayload {
  /** 通知标题 */
  title: string;
  /** 通知正文 */
  body: string;
}

/**
 * 托盘 → Web 广播命令 —— `web.broadcast` 的负载。
 * 判别联合: 渲染层必须穷举处理 (switch + assertNever)。
 * 主进程在 T15 实现托盘菜单后, 在此追加新的命令成员。
 */
export type WebCommand =
  /** 托盘"关于 dsh-desktop"→ 在 Web 内展示关于对话框 */
  | { command: 'show-about' }
  /** 托盘要求重新加载 Web UI (例如启动自启变更后刷新) */
  | { command: 'reload' };

/* ------------------------------------------------------------------ */
/* window.dshDesktop 接口                                               */
/* ------------------------------------------------------------------ */

/**
 * `window.dshDesktop` —— preload 暴露给渲染进程的桌面桥接 API。
 * 由 src/preload/index.ts 通过 `contextBridge.exposeInMainWorld('dshDesktop', ...)`
 * 注入, 整体冻结, 渲染层只能调用不能改造。
 */
export interface DshDesktop {
  /** 窗口控制 (标题栏按钮区, 设计规范 §3.1) */
  window: {
    /** 最小化窗口 */
    minimize(): Promise<void>;
    /** 最大化窗口 */
    maximize(): Promise<void>;
    /** 还原窗口 (取消最大化) */
    unmaximize(): Promise<void>;
    /** 关闭窗口 (隐藏到托盘) */
    close(): Promise<void>;
    /** 拉取当前窗口状态 */
    getState(): Promise<WindowState>;
  };
  /** 服务状态订阅 */
  status: {
    /** 订阅本地服务状态推送; 返回取消订阅函数 (组件卸载时务必调用) */
    onState(listener: (state: ServiceStatus) => void): () => void;
  };
  /** 首次运行引导 (设计规范 §4) */
  onboarding: {
    /** 提交 API Key 校验并保存; 返回校验结果 */
    submitKey(key: string): Promise<SubmitKeyResult>;
    /** 关闭引导对话框 (ESC / "稍后再说" / 保存成功后退场) */
    dismiss(): Promise<void>;
  };
  /** 开机自启 (托盘复选菜单) */
  autolaunch: {
    /** 查询是否已启用开机自启 */
    get(): Promise<boolean>;
    /** 设置开机自启 */
    set(enabled: boolean): Promise<void>;
  };
  /** 原生能力 */
  native: {
    /** 发送 Windows 原生通知 */
    notify(notification: NotificationPayload): Promise<void>;
  };
  /** 托盘 → Web 广播 */
  web: {
    /** 广播托盘命令给 Web 渲染进程 */
    broadcast(command: WebCommand): Promise<void>;
  };
}
