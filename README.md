# dsh-desktop

> A native Windows desktop app for DeepSeek Harness. Double-click to start. No Node.js, no command line, just a window.

## What is this?

DeepSeek Harness is DeepSeek's official agent framework. The official build is still a developer preview: to install it yourself you need Node 22.19+ or 24, pnpm, and a pile of command line steps. That is a high bar for most people.

dsh-desktop wraps the DeepSeek Harness Web UI in a native Windows desktop app. The interface is unchanged, it just gets a friendlier shell: the app lives in the system tray, the window has its own drawn title bar, messages use native Windows notifications, and only one instance can run at a time. Download, install, double-click the icon, and the window appears.

## Quick start

1. Download the latest release package from the Releases page
2. Install it, then double-click the DeepSeek Harness icon on your desktop
3. On first launch a setup window asks for your API key. Paste it in and the main window opens automatically

The app starts the service and opens the main window for you. No manual steps.

## First launch: setting your API key

The first run shows a setup dialog where you enter your DeepSeek API key:

1. Go to https://platform.deepseek.com and sign in
2. On the API Keys page click "Create" to get a key that looks like `sk-...`
3. Paste the key into the dialog, click save, and the main window opens

Your key is stored only on your own machine. It is never uploaded anywhere.

## Window and system tray

- **Frameless window**: no system default frame. The title bar is drawn by the app and supports dragging, minimize, maximize, and close
- **System tray**: the app keeps a tray icon. Right-click it for the menu
  - **Open main window**: show the main window
  - **Start on boot**: launch in the background after sign-in
  - **About**: show version info
  - **Exit**: quit completely
- **Close minimizes**: clicking the close button only minimizes to the tray, the app keeps running in the background. To actually quit, pick "Exit" from the tray menu
- **Single instance**: only one instance runs at a time. Double-clicking the icon again just brings up the existing window
- **Native notifications**: alerts use the standard Windows notification style, same as any normal app

## FAQ

**Antivirus warning or SmartScreen prompt?**

Packaged desktop apps have no code signature. The first run may trigger the Windows SmartScreen "Windows protected your PC" message, and some antivirus tools may raise a false positive. This is normal for packaged software, not a sign of a problem.

- SmartScreen: click "More info" then "Run anyway"
- Windows Defender: Virus & threat protection → Exclusions → Add an exclusion
- 360 安全卫士: 木马查杀 → 信任区 → 添加信任目录
- 火绒安全: 防护中心 → 病毒防护 → 信任区 → 添加文件/目录
- 腾讯电脑管家: 病毒查杀 → 信任区

**Can I install it in a path with Chinese characters?**

Yes. The desktop app does not rely on command line scripts, so it works fine under paths with Chinese characters (for example `软件\DeepSeek Harness`).

**Port already in use?**

The service listens on a system-assigned port (port 0), so Windows picks a free one at startup. It never conflicts with port 3080 or any other program, and no manual configuration is needed.

**Why is the app still running after I close the window?**

Closing the window minimizes to the tray by default, and the app keeps running in the background. Pick "Exit" from the tray menu to fully quit.

**Do I have to pay?**

The software is free and open source, but the DeepSeek API is pay-as-you-go. Current reference prices (per million tokens): deepseek-v4-flash $0.14 input / $0.28 output; deepseek-v4-pro $0.435 input / $0.87 output; cache-hit input is far cheaper. See https://api-docs.deepseek.com/quick_start/pricing for the authoritative list. Billing switches to peak/off-peak pricing starting 2026-08-16.

## Technical notes

- Built on Electron with a bundled Node v24.19.0
- Runs the Web UI via `@deepseek-ai/dsh@0.1.0-rc.6`
- Data lives in `%USERPROFILE%\.dsh`
- Key features: frameless window with a drawn title bar, system tray, native notifications, single-instance mode, first-run API key onboarding

## Disclaimer

Community project, not an official DeepSeek product. DeepSeek Harness is in developer preview and may change without notice. This project is MIT licensed. Check the official docs first when you hit problems.

## Links

- Official repo: https://github.com/deepseek-ai/deepseek-harness
- API console: https://platform.deepseek.com
- Topics: dsh-plugin, dsh, deepseek-harness, windows, electron, desktop
