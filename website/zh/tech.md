# 技术说明

## 技术栈

- 基于 **Electron** 构建,内置 **Node v24.19.0**
- 使用 `@deepseek-ai/dsh@0.1.0-rc.6` 启动 DeepSeek Harness Web UI
- 原生 Windows 无边框窗口(自绘标题栏),保留标准窗口语义:可缩放、Aero Snap 贴边、Win11 Snap Layouts

## 数据与目录

| 项目 | 位置 |
| --- | --- |
| 应用数据 | `%USERPROFILE%\.dsh` |
| WebView2 用户数据 | `%LOCALAPPDATA%\dsh-desktop\WebView2` |

## 主要功能

- 无边框窗口与自绘标题栏(36px,含鲸鱼图标、应用名与服务状态点)
- 系统托盘(打开主界面 / 开机自启 / 关于 / 退出)
- Windows 原生通知
- 单实例运行
- 首次启动 API Key 引导(Key 仅保存在本机)
- 服务端口由系统自动分配(端口 0),无需手动配置

## 架构要点

- 关闭窗口 = 隐藏到托盘,单个 WebView 实例贯穿整个生命周期,重新打开瞬时恢复
- 外壳不向 WebView 注入任何样式或脚本,不滚动、不遮挡、不监听页面 DOM
- 服务健康状态通过 1s 间隔轮询,只更新标题栏 6px 状态点,单元素重绘

## 版本

当前版本:`v0.2.0`。DeepSeek Harness 仍处于 developer preview 阶段,后续版本可能引入破坏性变更。
