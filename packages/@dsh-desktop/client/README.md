# @dsh-desktop/client

dsh-desktop 浏览器侧桌面桥接插件 —— 随 `desktop` profile 加载进 DeepSeek Harness 的 Web UI。

The desktop bridge plugin for dsh-desktop. It is loaded into the DeepSeek Harness Web UI by the `desktop` profile and bridges the native Electron shell with the web page.

## What it does

- **原生 → Web**：暴露托盘命令处理器（`show-about` / `reload`），preload 在收到主进程广播时调用它路由命令。
- **Web → 原生**：暴露 `notifyNative()` 助手（`window.dshDesktopNotify`），让页面能发送 Windows 原生通知。

本插件不注入任何视觉样式；在纯浏览器环境（无 `window.dshDesktop`）下优雅降级。

## Install

This package is meant to be installed as a DeepSeek Harness plugin. Inside a DeepSeek Harness project, run:

```sh
dsh plugin add @dsh-desktop/client
```

It is a Cordis plugin that exposes `name` / `inject` / `Config` / `apply` and is loaded automatically by the `desktop` profile. You normally do not need to install it manually — the dsh-desktop app bundles it and mounts it with the `desktop` profile.

## Development

```sh
npm run build   # tsc → lib/
npm test        # vitest
```

## License

MIT
