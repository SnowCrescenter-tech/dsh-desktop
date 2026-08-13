/**
 * dsh-desktop 系统托盘 —— 常驻托盘图标 + 右键菜单 (设计规范 §3.2)。
 *
 * 行为约定:
 *   - 单击托盘图标: 显示并聚焦主窗口 (托盘行为永不隐藏窗口);
 *   - 右键菜单结构: 标题(禁用) / 打开主界面 / 检查更新 / 重启并更新(仅就绪时) /
 *     开机自启(复选) / 分隔线 / 关于 dsh-desktop / 退出;
 *   - 开机自启复选项: 勾选状态与注册表实时同步 (syncAutolaunch),
 *     点选后先落盘, 失败则回读注册表恢复真实勾选;
 *   - 更新联动 (T18): "检查更新"触发一次手动检查 (结果由 updater 弹原生通知);
 *     更新下载就绪后菜单出现"重启并更新", 托盘提示切为"新版本已就绪, 重启后更新",
 *     由组合根在 updater.onPhaseChange 里驱动 syncAutolaunch 刷新菜单;
 *   - "关于 dsh-desktop" 经 web.broadcast 推给 Web 渲染进程展示。
 */
import { app, Menu, Tray } from 'electron';
import type { MenuItemConstructorOptions } from 'electron';
import { join } from 'node:path';

import type { WebCommand } from '../shared/contract.js';

/** 托盘悬停提示 (常规) */
export const TRAY_TOOLTIP = 'DeepSeek Harness — 本地服务运行中';

/** 托盘悬停提示 (更新就绪时) */
export const TRAY_TOOLTIP_UPDATE_READY = 'DeepSeek Harness — 新版本已就绪，重启后更新';

/** 菜单标题 (禁用项, 仅展示应用名) */
export const TRAY_MENU_TITLE = 'DeepSeek Harness';

/** 托盘图标相对应用根目录 (app.getAppPath()) 的路径 */
const TRAY_ICON_RELATIVE_PATH = join('resources', 'tray-icon.ico');

export interface TrayDeps {
  /** 显示并聚焦主窗口 (单击托盘 / "打开主界面" 共用) */
  showWindow(): void;
  /** 广播托盘命令给 Web 渲染进程 ("关于 dsh-desktop" → show-about) */
  broadcast(command: WebCommand): void;
  /** 查询开机自启状态 */
  getAutolaunchEnabled(): Promise<boolean>;
  /** 设置开机自启状态 */
  setAutolaunchEnabled(enabled: boolean): Promise<void>;
  /** 触发一次手动更新检查 (结果由 updater 弹原生通知, 见 update.ts) */
  checkForUpdates(): void;
  /** 是否已有就绪的更新 (true → 菜单出现"重启并更新", 提示切为就绪文案) */
  hasReadyUpdate(): boolean;
  /** 退出并安装已下载的更新 (仅 hasReadyUpdate 为 true 时启用) */
  quitAndInstall(): void;
}

export interface TrayController {
  /** 重新读取开机自启状态并重建菜单 (组合根启动后可调用一次) */
  syncAutolaunch(): Promise<void>;
  /** 销毁托盘 (退出前清理) */
  dispose(): void;
}

export function createTray(deps: TrayDeps): TrayController {
  const tray = new Tray(join(app.getAppPath(), TRAY_ICON_RELATIVE_PATH));
  tray.setToolTip(TRAY_TOOLTIP);

  // 单击托盘: 显示并聚焦主窗口; 托盘行为永不隐藏窗口
  tray.on('click', () => {
    deps.showWindow();
  });

  /** 复选状态变更后的落盘 + 菜单重同步 (失败时回读注册表恢复真实勾选) */
  async function onAutolaunchToggle(target: boolean): Promise<void> {
    try {
      await deps.setAutolaunchEnabled(target);
    } catch {
      // 写入失败: 忽略, 交由回读注册表恢复真实勾选
    }
    await syncAutolaunch();
  }

  function buildMenu(autolaunchChecked: boolean, updateReady: boolean): void {
    // 更新就绪时托盘提示切换为"新版本已就绪, 重启后更新"
    tray.setToolTip(updateReady ? TRAY_TOOLTIP_UPDATE_READY : TRAY_TOOLTIP);
    // 仅更新就绪时才出现"重启并更新"入口 (点击走 updater.quitAndInstall, 内部仍有 ready 护栏)
    const updateItems: MenuItemConstructorOptions[] = updateReady
      ? [{ label: '重启并更新', click: () => deps.quitAndInstall() }]
      : [];
    const template: MenuItemConstructorOptions[] = [
      { label: TRAY_MENU_TITLE, enabled: false },
      { label: '打开主界面', click: () => deps.showWindow() },
      { label: '检查更新', click: () => deps.checkForUpdates() },
      ...updateItems,
      {
        label: '开机自启',
        type: 'checkbox',
        checked: autolaunchChecked,
        click: (menuItem) => {
          void onAutolaunchToggle(menuItem.checked);
        },
      },
      { type: 'separator' },
      {
        label: '关于 dsh-desktop',
        click: () => deps.broadcast({ command: 'show-about' }),
      },
      { label: '退出', click: () => app.quit() },
    ];
    tray.setContextMenu(Menu.buildFromTemplate(template));
  }

  async function syncAutolaunch(): Promise<void> {
    // 菜单重建同时读取开机自启与更新就绪两个状态
    buildMenu(await deps.getAutolaunchEnabled(), deps.hasReadyUpdate());
  }

  // 初始菜单: 勾选状态未知时先以未勾选渲染, 随后异步同步真实状态
  buildMenu(false, deps.hasReadyUpdate());
  void syncAutolaunch();

  return {
    syncAutolaunch,
    dispose: () => {
      tray.destroy();
    },
  };
}
