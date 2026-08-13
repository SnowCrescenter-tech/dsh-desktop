/**
 * 主进程入口 —— 脚手架占位实现。
 *
 * 当前仅创建主窗口并加载 renderer 产物,用于验证 Electron + electron-vite
 * 三段式 (main/preload/renderer) 工具链可运行。后续在此接入设计规范
 * (dsh-desktop-design-spec.md) 中的无边框窗口 / 托盘 / 引导对话框 /
 * 本地服务生命周期等外壳能力。
 */
import { app, BrowserWindow, shell } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// ESM 下无 __dirname,基于 import.meta.url 推导构建产物所在目录 (dist/main)。
const appDir = dirname(fileURLToPath(import.meta.url))

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 800,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      // ESM 预加载脚本由 electron-vite 输出为 index.mjs
      preload: join(appDir, '../preload/index.mjs'),
      // ESM preload 要求关闭 sandbox (electron-vite ESM 模板约定)
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // 外部链接一律交给系统浏览器,避免在应用窗口内打开
  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // dev 模式加载 electron-vite dev server;生产模式加载构建产物
  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl)
  } else {
    void mainWindow.loadFile(join(appDir, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    // macOS 惯例:点击 Dock 图标且无窗口时重建窗口
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // Windows/Linux 全部窗口关闭即退出;macOS 保持应用存活
  if (process.platform !== 'darwin') app.quit()
})
