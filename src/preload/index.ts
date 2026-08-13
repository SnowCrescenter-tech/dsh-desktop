/**
 * dsh-desktop preload —— 通过 contextBridge 把 IPC 契约暴露为 `window.dshDesktop`。
 *
 * 职责边界:
 *   - 仅做"通道转发": 把每个接口方法映射到 src/shared/contract.ts 中定义且
 *     唯一命名的 IPC 通道 (invoke 请求 / on 订阅), 不做任何业务逻辑;
 *   - 校验与持久化等业务全部在主进程实现 (T15), 本文件只负责白名单转发;
 *   - 暴露的对象整体冻结 (含各分组), 渲染层只能调用, 无法改造成员。
 *
 * 安全约定: 绝不直接暴露 ipcRenderer; 通道名一律来自 contract 常量,
 * 渲染层无法注入任意通道。
 */
import {
  contextBridge,
  ipcRenderer,
  type IpcRendererEvent,
} from 'electron';

import {
  autolaunchChannels,
  nativeChannels,
  onboardingChannels,
  statusChannels,
  webChannels,
  windowChannels,
  type DshDesktop,
  type ServiceStatus,
} from '../shared/contract.js';

/** 递归冻结整棵对象树 (含嵌套分组与叶子函数), 防止渲染层篡改桥接 API */
function freezeDeep<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.freeze(value);
    for (const key of Object.keys(value)) {
      freezeDeep((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

/**
 * 契约实现 —— 每个方法对应 contract.ts 中恰好一个通道常量。
 * 返回类型由 `DshDesktop` 注解约束, 主进程返回的负载形状以契约为准。
 */
const api: DshDesktop = {
  window: {
    minimize: () => ipcRenderer.invoke(windowChannels.minimize),
    maximize: () => ipcRenderer.invoke(windowChannels.maximize),
    unmaximize: () => ipcRenderer.invoke(windowChannels.unmaximize),
    close: () => ipcRenderer.invoke(windowChannels.close),
    getState: () => ipcRenderer.invoke(windowChannels.getState),
  },
  status: {
    onState: (listener) => {
      // ipcRenderer.on 的监听器形状 (event, payload); 事件对象透传忽略
      const handler = (_event: IpcRendererEvent, state: ServiceStatus): void => {
        listener(state);
      };
      ipcRenderer.on(statusChannels.onState, handler);
      return () => {
        ipcRenderer.removeListener(statusChannels.onState, handler);
      };
    },
  },
  onboarding: {
    submitKey: (key) => ipcRenderer.invoke(onboardingChannels.submitKey, { key }),
    dismiss: () => ipcRenderer.invoke(onboardingChannels.dismiss),
  },
  autolaunch: {
    get: () => ipcRenderer.invoke(autolaunchChannels.get),
    set: (enabled) => ipcRenderer.invoke(autolaunchChannels.set, { enabled }),
  },
  native: {
    notify: (notification) => ipcRenderer.invoke(nativeChannels.notify, notification),
  },
  web: {
    broadcast: (command) => ipcRenderer.invoke(webChannels.broadcast, command),
  },
};

contextBridge.exposeInMainWorld('dshDesktop', freezeDeep(api));
