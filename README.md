# dsh-desktop

[中文](./README.zh.md) · **English**

<p align="center">
  <img src="resources/onboarding-whale.svg" width="56" alt="dsh-desktop" />
</p>

> One-click native desktop for DeepSeek Harness. No Node.js, no command line: install, double-click, and a window opens.

> Frameless window with a drawn title bar, system tray, native Windows notifications, and a single instance. All of DeepSeek Harness, none of the setup.

<p align="center">
  <a href="https://github.com/SnowCrescenter-tech/dsh-desktop/releases"><img alt="version" src="https://img.shields.io/badge/version-0.2.0-4D6BFE" /></a>
  <img alt="license" src="https://img.shields.io/badge/license-MIT-4D6BFE" />
  <img alt="platform" src="https://img.shields.io/badge/platform-Windows-10131A" />
  <img alt="compat" src="https://img.shields.io/badge/DeepSeek_Harness-0.1.0--rc.6-12A5A1" />
  <a href="https://github.com/SnowCrescenter-tech/dsh-desktop"><img alt="stars" src="https://img.shields.io/github/stars/SnowCrescenter-tech/dsh-desktop?style=social" /></a>
  <a href="https://github.com/SnowCrescenter-tech/dsh-desktop/fork"><img alt="forks" src="https://img.shields.io/github/forks/SnowCrescenter-tech/dsh-desktop?style=social" /></a>
  <a href="https://github.com/SnowCrescenter-tech/dsh-desktop/actions/workflows/ci.yml"><img alt="ci" src="https://img.shields.io/github/actions/workflow/status/SnowCrescenter-tech/dsh-desktop/ci.yml?label=CI&color=4D6BFE" /></a>
</p>

<!-- Badge notes: version and license are static. Keep the version in sync with package.json / VERSION on every release, and switch it to a live release badge (github/v/release) once the first GitHub Release exists. Stars, forks and CI are live shields.io links and update on their own. Platform and DeepSeek Harness compatibility are static. -->

## What is this?

DeepSeek Harness is DeepSeek's official agent framework. The official build is still a developer preview: setting it up by hand means installing Node 22.19+ or Node 24, pnpm, and a stack of command line steps. That is a high bar for most people.

dsh-desktop wraps the DeepSeek Harness Web UI in a native Windows desktop app. The interface itself is untouched, it just gets a friendlier shell: the app lives in the system tray, the window has its own drawn title bar, notifications use the standard Windows style, and only one instance can run at a time. Download, install, double-click, done.

## Features

- `▭` **Frameless window**: no system frame. The 36px title bar is drawn by the app and carries a live status dot: teal while the local service runs, grey while it starts, red when something fails. On Windows 11 the corners come from DWM, natively.
- `▣` **System tray**: the app stays in the tray. Single-click brings the window back; right-click opens the menu: open main window, start on boot (checkbox), about, exit.
- `◈` **Native notifications**: alerts use the standard Windows notification style, like any normal app, with a tray-balloon fallback where native support is missing.
- `◎` **Single instance**: one copy at a time. A second double-click just brings the existing window to the front.
- `↻` **Start on boot**: optionally launch in the background after sign-in, backed by a Windows registry Run key.
- `▤` **First-run onboarding**: the first launch shows a guided dialog that asks for your DeepSeek API key. The key is saved only on this machine, in `<DSH_HOME>/.env`.
- `⇄` **Port 0 auto-assign**: the service asks Windows for a free port on every launch (`--port 0`), so it never collides with port 3080 or any other program.

## How it works

dsh-desktop is an Electron shell. The main process owns the window, tray, notifications, auto-launch and the runtime supervisor that starts and watches the bundled DeepSeek Harness CLI. A preload bridge exposes a small, frozen `window.dshDesktop` API to the renderer. The window's own web contents draw the title bar, and a sandboxed `WebContentsView` below it hosts the DeepSeek Harness Web UI, which runs on the `desktop` profile: `@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-web-app`, and `@dsh-desktop/client`.

<p align="center"><img src="docs/architecture.svg" alt="dsh-desktop 架构" width="900"></p>

## First run: what happens under the hood

The first launch is an orchestrated sequence. If no API key is configured, a modal dialog asks for one. The profile is written to disk, the bundled CLI is spawned with `--profile desktop --port 0`, and the supervisor waits for the ready line (`dsh web: http://127.0.0.1:<port>`). Once parsed, the Web UI is loaded into the content view and the status dot turns teal.

1. Acquire the single-instance lock — a second launch just brings the existing window to the front.
2. If no API key is configured yet, the onboarding dialog asks for one and saves it to `<DSH_HOME>/.env`.
3. Write the `desktop` profile to disk, then spawn the bundled CLI: `dsh --profile desktop --port 0`.
4. Wait for the ready line (`dsh web: http://127.0.0.1:<port>`). Once parsed, the Web UI loads into the content view and the status dot turns teal. If it times out, an error view with a retry button is shown.

## Quick start

1. Grab the latest installer from the Releases page.
2. Install, then double-click the DeepSeek Harness icon on your desktop.
3. On first launch, paste your DeepSeek API key into the setup dialog. The main window opens on its own.

The app starts the service and opens the main window for you. No manual steps.

## Screenshot

<!-- TODO: 截图 -->

## First launch: setting your API key

The first run shows a setup dialog where you enter your DeepSeek API key:

1. Go to https://platform.deepseek.com and sign in.
2. On the API Keys page click "Create" to get a key that looks like `sk-...`.
3. Paste the key into the dialog, click save, and the main window opens.

Your key is stored only on your own machine. It is never uploaded anywhere.

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

- Built with Electron 43 and a bundled Node runtime (v24.19.0).
- Runs the Web UI through `@deepseek-ai/dsh@0.1.0-rc.6`.
- Data and your API key live under `%USERPROFILE%\.dsh` (override with the `DSH_HOME` environment variable).
- The `desktop` profile mounts, in order: `@deepseek-ai/dsh-base` → `@deepseek-ai/dsh-web-app` → `@dsh-desktop/client`.
- The title bar, tray and onboarding follow a minimal, calm design language built on the DeepSeek brand palette (accent `#4D6BFE`, dark ink `#10131A`, paper `#F4F6F9`).

## Disclaimer

Community project, not an official DeepSeek product. DeepSeek Harness is in developer preview and may change without notice. This project is MIT licensed. Check the official docs first when you hit problems.

## Links

- Official repo: https://github.com/deepseek-ai/deepseek-harness
- API console: https://platform.deepseek.com
- Topics: dsh-plugin, dsh, deepseek-harness, windows, electron, desktop
