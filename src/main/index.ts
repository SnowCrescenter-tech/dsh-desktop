/**
 * 主进程组合根 (T15) —— 把所有 Wave 1 + Wave 2 模块装配成一个可运行的 Electron 应用。
 *
 * 装配顺序:
 *   1. app ready 之前: Per-Monitor v2 DPI 开关 (enablePerMonitorV2, 仅 win32);
 *   2. 单实例锁: 第二实例直接退出 (exit 0), 首实例收到 second-instance → 显示主窗口;
 *   3. app ready 后: 窗口控制器 (window.ts, 内含 AppUserModelId / DWM 圆角 /
 *      window:* IPC)、引导 IPC (onboarding.ts)、其余契约 IPC (ipc.ts)、
 *      托盘 (tray.ts)、首次运行编排 (first-run.ts);
 *   4. before-quit: 停止 dsh 运行时 (killDsh 树杀)、销毁托盘、解除窗口 IPC;
 *   5. window-all-closed 不退出 —— 托盘常驻, 真正退出只能走托盘"退出"。
 */
import { app } from 'electron';
import { join } from 'node:path';

import { statusChannels, webChannels } from '../shared/contract.js';
import type { ServiceStatus, WebCommand } from '../shared/contract.js';
import { createAutolaunch, createDefaultRegExecutor } from './autolaunch.js';
import type { Autolaunch } from './autolaunch.js';
import { createFirstRun, prepareDesktopProfile } from './first-run.js';
import type { FirstRun } from './first-run.js';
import { registerIpcHandlers, showErrorView as showInWindowError, findDshWebContents } from './ipc.js';
import type { RegisterIpcDeps } from './ipc.js';
import { hasKey } from './key-store.js';
import { createNotifier } from './notifications.js';
import { createOnboardingWindow, registerOnboardingIpc } from './onboarding.js';
import { resolveBinJs, resolveDshHome, resolvePluginTarballs } from './profile/resolve.js';
import { createTray } from './tray.js';
import type { TrayController } from './tray.js';
import {
  APP_USER_MODEL_ID,
  configureAppIdentity,
  createWindowController,
  enablePerMonitorV2,
} from './window.js';
import type { DshWindowController } from './window.js';

// 必须发生在 app ready 之前 (Chromium 启动参数)
enablePerMonitorV2(app);

// 单实例锁: 拿不到锁说明已有实例在运行, 本进程直接退出 (exit 0)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.exit(0);
} else {
  bootstrap();
}

/** 组合根装配入口 (拿到单实例锁后才进入) */
function bootstrap(): void {
  let controller: DshWindowController | null = null;
  let tray: TrayController | null = null;
  let firstRun: FirstRun | null = null;
  let disposeIpc: (() => void) | null = null;

  // 第二实例尝试启动: 显示并聚焦首实例主窗口
  app.on('second-instance', () => {
    controller?.show();
  });

  app.whenReady().then(() => {
    // Windows 通知 / 托盘标识 (win32 下才生效)
    configureAppIdentity(app);

    // 无边框主窗口 + WebContentsView 内容区 + window:* IPC
    controller = createWindowController();
    const win = controller.getWindow();

    // 引导对话框的 IPC (onboarding:submit-key / onboarding:dismiss)
    registerOnboardingIpc();

    // 开机自启 (Windows 注册表 Run 键)
    const autolaunch: Autolaunch = createAutolaunch({
      reg: createDefaultRegExecutor(),
      appPath: process.execPath,
    });
    // 原生通知 (AppUserModelID 缺失时 createNotifier 内部补齐)
    const notifier = createNotifier({ appUserModelId: APP_USER_MODEL_ID });
    // web.broadcast 处理器会由 ipc.ts 注入, 这里先建好实现
    const broadcastToWeb = (command: WebCommand): void => {
      // 广播目标: dsh Web UI (WebContentsView) —— 托盘"关于 dsh-desktop"等命令
      const web = findDshWebContents(win);
      if (web !== null) {
        web.send(webChannels.broadcast, command);
      }
    };

    const ipcDeps: RegisterIpcDeps = {
      autolaunch,
      notifier,
      broadcastToWeb,
    };
    disposeIpc = registerIpcHandlers(ipcDeps);

    // 服务状态推送: main→renderer, 由 first-run 在状态变化时驱动
    const emitStatus = (status: ServiceStatus): void => {
      if (!win.isDestroyed()) {
        win.webContents.send(statusChannels.onState, status);
      }
    };

    // 托盘: 显示窗口 / 广播 / 开机自启同步
    tray = createTray({
      showWindow: () => controller?.show(),
      broadcast: broadcastToWeb,
      getAutolaunchEnabled: () => autolaunch.isEnabled(),
      setAutolaunchEnabled: (enabled: boolean) => autolaunch.setEnabled(enabled),
    });

    // 首次运行编排: 引导 → profile → spawn → 监督 → 状态上报 / 错误视图
    const dshHome = resolveDshHome();
    const appPath = app.getAppPath();
    const binJs = resolveBinJs(appPath);
    const pluginRoot = join(appPath, 'packages', '@dsh-desktop', 'client');
    const pluginTarball = resolvePluginTarballs(join(appPath, 'resources', 'plugins'))[0];
    // 组合根持有 DSH_HOME, 引导提交后写入 .env 的路径保持一致
    const keyConfigured = (): boolean => {
      const envKey = process.env['DEEPSEEK_API_KEY'];
      if (envKey !== undefined && envKey.trim() !== '') {
        return true;
      }
      return hasKey(dshHome);
    };

    firstRun = createFirstRun({
      dshHome,
      binJs,
      pluginRoot,
      // pluginTarball 缺省时不带该字段 (exactOptionalPropertyTypes 兼容)
      ...(pluginTarball !== undefined ? { pluginTarball } : {}),
      controller,
      hasKey: keyConfigured,
      showOnboarding: (parent) => createOnboardingWindow(parent),
      emitStatus,
      showErrorView: (message, onRetry) => showInWindowError(win, message, onRetry),
      prepareProfile: () =>
        prepareDesktopProfile({
          dshHome,
          binJs,
          pluginRoot,
          ...(pluginTarball !== undefined ? { pluginTarball } : {}),
        }),
    });
    firstRun.start();

    app.on('activate', () => {
      // macOS 惯例: 点击 Dock 图标恢复窗口 (隐藏到托盘后同样适用)
      if (controller !== null) {
        controller.show();
      }
    });
  });

  // 真正退出前: 停止 dsh 运行时 (树杀) + 销毁托盘 + 解除窗口/其余 IPC
  app.on('before-quit', () => {
    if (firstRun !== null) {
      void firstRun.stop();
    }
    tray?.dispose();
    controller?.dispose();
    disposeIpc?.();
  });

  // 托盘常驻: 全部窗口关闭不退出应用; 退出只能走托盘菜单 (app.quit)
  app.on('window-all-closed', () => {
    // 不做任何事 —— 让托盘保持应用存活
  });
}
