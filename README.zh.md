# DeepSeek Harness 桌面版(dsh-desktop)

> 一个原生 Windows 桌面程序,双击就能用上 DeepSeek Harness。不装 Node,不敲命令,打开就是一个窗口。

## 这是什么

DeepSeek Harness 是 DeepSeek 官方的 agent 框架,能帮你把复杂任务交给 AI 一步步完成。不过官方目前还是开发者预览版,想自己装起来,得先准备 Node 22.19+ 或 Node 24、装好 pnpm,再对着命令行敲一堆命令去构建。对大多数非技术用户来说,这一步的门槛实在太高了。

dsh-desktop 把 DeepSeek Harness 的 Web UI 包进了一个原生 Windows 桌面程序。界面没有任何改动,只是多了一层顺手的外壳:程序常驻系统托盘,窗口用自绘的标题栏,消息用 Windows 原生通知提醒,并且只允许一个实例运行。下载、安装、双击图标,窗口就出来了。

## 三步上手

1. 到本项目 Releases 页面下载最新安装包
2. 安装完成后,双击桌面上的 DeepSeek Harness 图标启动
3. 首次启动会弹出"设置 API Key"引导窗口,粘贴你的 Key 后自动进入主界面

程序会自动启动服务、打开主界面,这些都不需要你手动操作。

## 首次启动:设置 API Key

第一次运行会先弹出引导窗口,让你填写 DeepSeek API Key:

1. 打开 https://platform.deepseek.com,注册并登录
2. 在 API Keys 页面点击"创建",会得到一个形如 `sk-xxxxxxxx` 的 Key
3. 把 Key 粘贴进引导窗口,点击保存,主界面就会自动打开

你的 Key 只会写在自己电脑上,不会上传到任何地方。

## 窗口与系统托盘

- **无边框窗口**:窗口没有系统默认边框,标题栏由程序自己绘制,支持拖动、最小化、最大化、关闭
- **系统托盘**:程序常驻托盘图标,右键可打开菜单
  - **打开主界面**:显示主窗口
  - **开机自启**:开机后在后台自动启动
  - **关于**:查看版本信息
  - **退出**:完全退出程序
- **关闭即最小化**:点窗口的关闭按钮只是最小化到托盘,程序继续在后台运行;要真正结束程序,请从托盘菜单选择"退出"
- **单实例运行**:同一时间只会有一个实例,重复双击图标会直接唤出已有的窗口
- **原生通知**:提醒使用 Windows 原生通知样式,和普通应用一致

## 常见问题

**杀毒软件报毒、SmartScreen 提示怎么办?**

桌面应用打包后没有数字签名,第一次运行时 Windows SmartScreen 可能会提示"Windows 已保护你的电脑",部分杀毒软件也可能误报。这是打包软件的常见情况,不代表程序有问题。

- SmartScreen 提示:点击"更多信息" → "仍要运行"
- Windows Defender:病毒和威胁防护 → 排除项 → 添加排除项
- 360 安全卫士:木马查杀 → 信任区 → 添加信任目录
- 火绒安全:防护中心 → 病毒防护 → 信任区 → 添加文件/目录
- 腾讯电脑管家:病毒查杀 → 信任区

**能安装在中文路径吗?**

可以。桌面版不依赖命令行脚本,装在带中文的路径(比如"软件\DeepSeek Harness")下也能正常运行。

**端口被占用怎么办?**

服务监听端口由系统自动分配(端口 0),启动时系统会挑一个空闲端口,天然不会和 3080 或其他程序冲突,也不需要手动配置。

**关掉窗口后程序为什么还在?**

关闭窗口默认是最小化到托盘,程序仍在后台运行。从托盘菜单里选"退出"才会完全结束。

**需要付费吗?**

软件本身是免费开源项目,但调用 DeepSeek 的 API 由官方按量计费。当前参考价(每百万 tokens):deepseek-v4-flash 输入 $0.14、输出 $0.28;deepseek-v4-pro 输入 $0.435、输出 $0.87;命中缓存时输入价格要低得多。具体价格以 https://api-docs.deepseek.com/quick_start/pricing 为准,2026-08-16 起官方改为峰谷计价。

## 技术说明

- 基于 Electron 构建,内置 Node v24.19.0
- 使用 `@deepseek-ai/dsh@0.1.0-rc.6` 启动 Web UI
- 数据保存在 `%USERPROFILE%\.dsh`
- 主要功能:无边框窗口与自绘标题栏、系统托盘、原生通知、单实例运行、首次启动 API Key 引导

## 免责声明

本项目是社区作品,非 DeepSeek 官方出品。DeepSeek Harness 目前处于 developer preview 阶段,后续可能有破坏性变更。本项目基于 MIT 协议开源,使用中遇到的问题请优先查阅官方文档。

## 相关链接

- DeepSeek Harness 官方仓库:https://github.com/deepseek-ai/deepseek-harness
- API 控制台:https://platform.deepseek.com
- 项目 Topics:dsh-plugin、dsh、deepseek-harness、windows、electron、desktop
