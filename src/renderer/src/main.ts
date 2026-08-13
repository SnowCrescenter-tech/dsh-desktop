/**
 * 渲染进程占位入口 —— 仅证明 renderer 构建与类型检查链路可用。
 * 按设计规范 (spec §1),外壳 (chrome) 不承载任何业务 UI;
 * 后续窗口内容由 WebView2 加载 DeepSeek Harness 自身界面。
 */
const appEl = document.getElementById('app')

if (appEl) {
  appEl.textContent = 'dsh-desktop renderer placeholder'
}
