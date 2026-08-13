# dsh-desktop Roadmap

> 超高质量桌面端 —— 让 DeepSeek Harness 用起来更顺心。

## 战略定位

- **目标**：极致质感 + 流畅体验，不做功能堆砌。
- **放弃插件市场**：让别人搞，我们专注核心桌面端。
- **全平台为目标**：Windows 优先落地，架构预留 macOS / Linux。
- **两条铁律**：
  1. **内容同步** —— 每个功能落地，同步更新 `README.md` / `README.zh.md` / VitePress 文档站（双语），作为 commit 的固定一部分。
  2. **元数据双语** —— repo `description`（中文主 + English）+ `topics`（生态词 + 平台词 + 定位词），方便搜索与互推。

## Phase A — v0.2 收尾发布（当前）

- [ ] T16 e2e 冒烟测试
- [ ] T17 打包（便携 zip + NSIS 安装器）
- [x] T18 自动更新（electron-updater + GitHub Releases 发布：NSIS 安装版后台自动下载、就绪后"重启并更新"；便携版引导到 Releases 页）
- [ ] README 美化（双语 + 徽章 + 架构图）
- [ ] Wave 5：docs 同步 + tag `v0.2.0` + GitHub Release

## Phase B — 质感升级（v0.3 美术 pass）

借鉴 oh-dsh-desktop + Codex 的设计语言，换成我们的 DNA：

| 项 | 借鉴 | 我们的差异化 |
|---|---|---|
| 令牌系统（alias + specific 两层） | oh-dsh-desktop | DeepSeek 蓝 `#4D6BFE` 单一强调色 |
| 悬浮面板范式（12px 内边距 + 22px 圆角 + 柔和阴影） | oh-dsh-desktop | Windows DWM 原生圆角配合 |
| 线性图标系统（1.7 描边） | oh-dsh-desktop | 鲸鱼标识统一 |
| 动效纪律 → **弹簧缓动 + 可中断** | oh-dsh-desktop / Codex | 更「跟手」+ `prefers-reduced-motion` |
| 极简 diff 色调 + `·` 分隔状态行 | Codex | 应用到状态点 / 托盘提示 |
| 主题（暗墨 `#10131A` + 浅纸 `#F4F6F9`） | Codex（纯黑侧栏 + 蓝紫 identity） | 跟随系统 |

## Phase C — UX 顺心小组件（随时并入，低难度高价值）

1. 运行完成通知（窗口收到托盘后 agent 跑完自动 toast）——桥已就绪，半天
2. 会话成本估算 pill（`$0.012` 计费）——`tokenUsage` 数据现成，半天
3. 运行中阻止系统睡眠——一个 Win32 调用，1 天
4. 状态点增强（agent 运行中变蓝）——复用现有 6px 点

## Phase D — 全平台抽象（架构预留，v0.3+ 逐步补）

| 抽象 | Windows | macOS | Linux |
|---|---|---|---|
| `AutolaunchBackend` | 注册表 Run 键 | `LaunchAgents/*.plist` | `autostart/*.desktop` |
| 数据目录 | — | `app.getPath('userData')` 替换 `%LOCALAPPDATA%` | — |
| 进程树强杀 | `taskkill /T /F` | SIGTERM + pkill | SIGTERM + pkill |

## Phase E — 生态内容（并行，不影响桌面端）

- VitePress 文档站双语同步（已建）
- 可选：为社区插件生态贡献 README 模板 / 清单规范（帮别人搞市场，间接抬升生态地位）

## 依赖关系

- **阻塞路径（v0.2 发布）**：T16 → T17 → Wave5（tag `v0.2.0`）
- **并行可做（不阻塞）**：Phase B / C / D / E 全部可与 v0.2 收尾并行

## 节奏

先收尾 v0.2 发布（抢位置），然后 **Phase C（顺心组件）→ Phase B（质感升级）** 交替推进；Phase D 的全平台抽象随 C/B 改动顺手补（不单独立项）。
