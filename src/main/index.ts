/**
 * 主进程入口 —— 装配外壳能力 (设计规范 dsh-desktop-design-spec.md)。
 *
 * 本文件只做组合 (composition root):
 *   - app ready 之前: Per-Monitor v2 DPI 感知开关;
 *   - app ready 之后: 创建无边框窗口控制器 (src/main/window.ts),
 *     标题栏 UI 本体、托盘与本地服务生命周期由后续任务接入;
 *   - 首次运行 (无已保存 API Key, spec §4): 在主窗口上方弹出引导对话框。
 */
import { app, BrowserWindow } from 'electron';

import {
  createOnboardingWindow,
  hasSavedApiKey,
  registerOnboardingIpc,
} from './onboarding.js';
import {
  createWindowController,
  enablePerMonitorV2,
} from './window.js';

// 必须发生在 app ready 之前 (Chromium 启动参数)
enablePerMonitorV2(app);

app.whenReady().then(() => {
  const controller = createWindowController({ app });

  // 引导对话框的 IPC (submit-key / dismiss) 必须在窗口加载前注册
  registerOnboardingIpc();

  // 首次运行 (spec §4): 本机无已保存的 API Key 时, 在主窗口上方弹出引导对话框。
  // 用户"稍后再说"仅关闭对话框 —— Key 仍未配置, 下次启动会再次弹出。
  if (!hasSavedApiKey()) {
    createOnboardingWindow(controller.getWindow());
  }

  app.on('activate', () => {
    // macOS 惯例: 点击 Dock 图标恢复窗口 (隐藏到托盘后同样适用)
    if (BrowserWindow.getAllWindows().length > 0) {
      controller.show();
    }
  });

  // 真正退出前解除 IPC 处理器, 避免残留
  app.on('before-quit', () => {
    controller.dispose();
  });
});

app.on('window-all-closed', () => {
  // Windows/Linux 全部窗口关闭即退出; macOS 保持应用存活
  if (process.platform !== 'darwin') app.quit();
});
