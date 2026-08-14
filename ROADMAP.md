# dsh-desktop Roadmap

> 超高质量桌面端 —— 让 DeepSeek Harness 用起来更顺心。

## 战略定位

- **目标**：极致质感 + 流畅体验，不做功能堆砌。
- **放弃插件市场**：让别人搞，我们专注核心桌面端。
- **全平台为目标**：Windows 优先落地，架构预留 macOS / Linux。
- **两条铁律**：
  1. **内容同步** —— 每个功能落地，同步更新 `README.md`（单文件双语，页内锚点即时切换）/ VitePress 文档站（真正的中英即时切换），作为 commit 的固定一部分。
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

## Phase D — 全平台兼容（目标：Windows / macOS / Linux）

**目标**：同一套代码，三平台可构建。Windows 是当前唯一已落地平台；macOS / Linux 通过「平台抽象层」逐步补齐，不改主流程。

### D1. 平台抽象清单（当前 Windows 特定点 → 抽象接口 → 三平台实现）

| # | 当前 Windows 实现 | 抽象接口 | macOS | Linux | 涉及文件 |
|---|---|---|---|---|---|
| 1 | `HKCU\...\CurrentVersion\Run` 注册表 | `AutolaunchBackend` | `~/Library/LaunchAgents/*.plist`（launchd） | `~/.config/autostart/*.desktop` | `src/main/autolaunch.ts` |
| 2 | `%LOCALAPPDATA%\dsh-desktop` | `app.getPath('userData')`（Electron 跨平台） | `~/Library/Application Support/dsh-desktop` | `~/.config/dsh-desktop` | `src/main/store.ts` |
| 3 | `taskkill /T /F` 树杀 | `killProcessTree(pid)` | SIGTERM + `pkill -P` | SIGTERM + `pkill -P` | `src/main/runtime/process-handle.ts` |
| 4 | DWM 圆角（`DWMWA_WINDOW_CORNER_PREFERENCE`） | `applyRoundedCorners(win)` | 原生圆角（无需处理） | 由 WM 决定（无需处理） | `src/main/dwm.ts`、`winver.ts` |
| 5 | Windows Toast + AppUserModelID | `notify(payload)` | `new Notification`（Electron 原生） | `new Notification`（Electron 原生） | `src/main/notifications.ts` |

### D2. 其余平台差异点（需逐一确认，不阻塞 Windows）

| 差异点 | 说明 | 处理 |
|---|---|---|
| 托盘图标 | macOS 托盘用 template image（16×16 单色） | 按平台加载不同尺寸图标 |
| 单实例 | `requestSingleInstanceLock` 跨平台可用 | 无需改 |
| 快捷键 | macOS 用 `Cmd`，Windows/Linux 用 `Ctrl` | `Menu` 模板按平台 |
| 沙箱 | macOS `sandbox-exec`（可选强化） | Linux 可用 bwrap；Windows 无原生沙箱 |

### D3. 执行节奏（不单独立项，随其他改动顺手补）

1. **D1-#2 数据目录**：一次小改（`%LOCALAPPDATA%` → `app.getPath('userData')`），立即可做，跨平台收益最大。
2. **D1-#3 树杀**：随「运行完成通知 / 阻止睡眠」等 Phase C 改动顺手加 `platform` 分派。
3. **D1-#1 自启**：抽 `AutolaunchBackend` 接口，先实现 Windows，macOS/Linux 后端留 TODO（接口化即完成 80%）。
4. **D1-#4/#5**：已基本就绪（DWM/通知已做 win32 守卫，非 Windows 自然走原生路径）。

### D4. 验收标准（上 macOS/Linux 前的门）

- [ ] `npm run build` 在 macOS / Linux runner 上通过（`electron-builder --mac` / `--linux`）
- [ ] 三平台都能：单实例 + 托盘 + 通知 + 自启 + 首启引导 + 端口 0 + 自动更新（macOS 用 `latest-mac.yml`）
- [ ] 中文路径 / 非 ASCII 用户名在所有平台正常

### D5. 多平台发布时间线（显式里程碑，逐版本验收）

| 版本 | 目标平台 | 内容 | 验收门（对应 D4） |
|---|---|---|---|
| **v0.2（当前）** | Windows ✅ | 首发：NSIS 安装器 + 便携 zip + 自动更新 + 双语 README/文档站 | CI 绿 + GitHub Release 出包 |
| **v0.3** | Windows 打磨 | Phase C 顺心组件 + Phase B 质感；顺带落地 **D1-#2 数据目录**（`app.getPath('userData')`）与 **D1-#3 树杀平台分派** | D1-#2/#3 抽象入库，Windows 行为回归无差异 |
| **v0.4** | macOS 🎯 | CI 增加 macOS runner + `electron-builder --mac`（dmg）；实现 **D1-#1 AutolaunchBackend(mac: launchd)**、托盘 template image、Cmd 快捷键、`latest-mac.yml` 自动更新；签名/公证调研（Developer ID + notarytool） | macOS 构建过 + 首启→托盘→通知→自启→更新全链路手测通过 |
| **v0.5** | Linux 🎯 | CI 增加 Linux runner + `electron-builder --linux`（AppImage + deb）；实现 **D1-#1 AutolaunchBackend(linux: autostart .desktop)**、`latest-linux.yml` 自动更新；主流桌面环境（GNOME/KDE）适配 | Linux 构建过 + 全链路手测通过 |
| **v0.6** | 三平台并行 | 三平台 CI 矩阵常态化，文档站/README 平台差异说明完善 | 每次发版三平台同版本出包 |

> 说明：v0.4 / v0.5 需要 macOS/Linux 构建机（GitHub Actions runner 免费额度内可做）；签名与公证（macOS）涉及开发者证书，是发布前的独立前置项，届时单独评估。

## Phase E — 生态内容（并行，不影响桌面端）

- VitePress 文档站双语同步（已建）
- 可选：为社区插件生态贡献 README 模板 / 清单规范（帮别人搞市场，间接抬升生态地位）

## 依赖关系

- **阻塞路径（v0.2 发布）**：T16 → T17 → Wave5（tag `v0.2.0`）
- **并行可做（不阻塞）**：Phase B / C / D / E 全部可与 v0.2 收尾并行

## 节奏

先收尾 v0.2 发布（抢位置），然后 **Phase C（顺心组件）→ Phase B（质感升级）** 交替推进；Phase D 的平台抽象按 **D5 时间线**落地——v0.3 顺手完成数据目录/树杀抽象，v0.4/v0.5 分别上 macOS / Linux 构建，全平台是明确的目标而非"随缘"。
