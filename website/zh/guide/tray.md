# 窗口与系统托盘

dsh-desktop 把 DeepSeek Harness 的 Web UI 包进一个原生 Windows 窗口。界面没有任何改动,只是多了一层顺手的外壳。

## 无边框窗口

窗口没有系统默认边框,标题栏由程序自己绘制,高 36px:

- **整条标题栏可拖动**,双击最大化 / 还原
- 左侧是 16px 鲸鱼图标与应用名 **DeepSeek Harness**
- 右侧是标准窗口控制钮:最小化、最大化、关闭

### 状态点

应用名右侧有一个 6px 的圆点,一眼就能看出本地服务状态:

| 颜色 | 状态 |
| --- | --- |
| <span style="display:inline-block;width:6px;height:6px;border-radius:999px;background:var(--ds-accent-teal);vertical-align:middle"></span> 青绿色 | 本地服务运行中(常驻稳态) |
| <span style="display:inline-block;width:6px;height:6px;border-radius:999px;background:var(--ds-text-tertiary);vertical-align:middle"></span> 灰色 | 启动中 / 服务未就绪 |
| <span style="display:inline-block;width:6px;height:6px;border-radius:999px;background:var(--ds-error);vertical-align:middle"></span> 红色 | 服务异常 |

状态点静止不动,不闪烁、不呼吸。悬停时会显示"本地服务运行中"的提示。

## 关闭即最小化

点窗口的**关闭**按钮只是最小化到托盘,程序继续在后台运行。首次隐藏时托盘会气泡提示一次。

要真正结束程序,请从托盘菜单选择"**退出**"。

## 系统托盘

程序常驻托盘图标,右键可打开菜单:

| 菜单项 | 作用 |
| --- | --- |
| 打开主界面 | 显示并前置主窗口 |
| 开机自启 | 勾选后开机在后台自动启动 |
| 关于 dsh-desktop | 查看版本信息 |
| 退出 | 停止本地服务并完全退出 |

单击托盘图标即可显示主窗口。仅当确有后台任务进行时,"退出"才会弹一次确认,平时直接退出,不打扰。

## 单实例运行

同一时间只会有一个实例在运行。重复双击图标不会打开第二个窗口,而是直接唤出已有的窗口。

## 原生通知

消息提醒使用 Windows 原生通知样式,和普通应用完全一致,不引入任何自定义弹窗样式。
