/**
 * 首次运行引导对话框逻辑 (设计规范 §4 / §5)。
 *
 * 状态机: empty → ready → (verifying) → 退出 | error
 *   - empty:     输入为空, 提示 "以 sk- 开头…" (tertiary), 主按钮禁用;
 *   - ready:     输入非空, 主按钮可用; Enter = 提交;
 *   - verifying: 提交中, 14px spinner (唯一允许的循环动画) + 输入/按钮禁用;
 *   - error:     校验失败, error 边框 + error-subtle chip; 聚焦即清除。
 *
 * 交互: Enter = 提交; ESC = 稍后再说 (退场动画 → onboarding:dismiss);
 * 眼睛切换掩码/明文; 焦点自动落到输入框。
 * 退场 (成功 / 稍后再说) 播放 fade+scale 100ms 后经 dismiss IPC 关闭窗口,
 * 主进程 window:close 通道属于主窗口 (隐藏到托盘), 对话框不使用它。
 */
import whaleSvgRaw from '../../../resources/onboarding-whale.svg?raw';

import { validateKey } from '../../shared/key-validation.js';

/** 引导对话框状态 (spec §4) */
type OnboardingState = 'empty' | 'ready' | 'error' | 'verifying';

/** 本地预检失败时的固定错误文案 (spec §4 error chip) */
const INVALID_KEY_MESSAGE = 'Key 无效，请检查后重试';

/** 资源线稿内的硬编码品牌蓝 (resources/onboarding-whale.svg) — 与 tokens.ts 同源 */
const WHALE_ACCENT = '#4D6BFE';

/** 读取 CSS 自定义属性中的时长 (ms), 供 JS 侧同步退场等待 */
function readDurationMs(name: string): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : 0;
}

/** 严格取元素引用; 缺失视为页面结构损坏 */
function requireEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (el === null) {
    throw new Error(`引导对话框缺少元素: #${id}`);
  }
  return el as T;
}

const dialog = requireEl<HTMLElement>('dialog');
const chip = requireEl<HTMLElement>('whale-chip');
const input = requireEl<HTMLInputElement>('key-input');
const eyeToggle = requireEl<HTMLButtonElement>('eye-toggle');
const eyeShowIcon = requireEl<HTMLElement>('eye-icon-show');
const eyeHideIcon = requireEl<HTMLElement>('eye-icon-hide');
const hint = requireEl<HTMLElement>('hint');
const errorChip = requireEl<HTMLElement>('error-chip');
const spinner = requireEl<HTMLElement>('spinner');
const submitBtn = requireEl<HTMLButtonElement>('submit-btn');
const laterBtn = requireEl<HTMLButtonElement>('later-btn');

/** 鲸鱼线稿注入: 把硬编码品牌蓝替换为 currentColor, 随主题令牌着色 */
chip.innerHTML = whaleSvgRaw.replaceAll(WHALE_ACCENT, 'currentColor');

let state: OnboardingState = 'empty';
/** 退场防重入 (成功 / 稍后再说只走一次) */
let closing = false;

/** 按状态渲染: 类名、状态槽内容、禁用面 */
function render(): void {
  const verifying = state === 'verifying';
  dialog.classList.toggle('is-error', state === 'error');
  hint.hidden = state !== 'empty';
  errorChip.hidden = state !== 'error';
  spinner.hidden = !verifying;

  input.disabled = verifying;
  eyeToggle.disabled = verifying;
  submitBtn.disabled = verifying || input.value.trim() === '';
  laterBtn.disabled = verifying;
}

function setState(next: OnboardingState): void {
  state = next;
  render();
}

/** 输入是否非空 (empty → ready 的判定) */
function hasText(): boolean {
  return input.value.trim() !== '';
}

/** 回到非错误态: 输入为空 → empty, 否则 → ready */
function clearError(): void {
  setState(hasText() ? 'ready' : 'empty');
}

/** 展示错误 chip (error 边框 + error-subtle, 聚焦即清除) */
function failWith(message: string): void {
  errorChip.textContent = message;
  setState('error');
}

/** 退场: fade+scale 100ms (reduced-motion 下 0ms) 后关闭对话框窗口 */
function closeWithExit(): void {
  if (closing) return;
  closing = true;
  dialog.classList.add('is-out');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const exitMs = reduceMotion ? 0 : readDurationMs('--duration-dialog-out');
  window.setTimeout(() => {
    void window.dshDesktop.onboarding.dismiss();
  }, exitMs);
}

/** 提交: 本地预检 → verifying → IPC 校验并保存 → 成功退场 / 失败回 error */
async function submit(): Promise<void> {
  if (state === 'verifying' || closing) return;

  const validation = validateKey(input.value);
  if (!validation.ok) {
    failWith(INVALID_KEY_MESSAGE);
    return;
  }

  setState('verifying');
  const result = await window.dshDesktop.onboarding.submitKey(validation.key);
  if (result.ok) {
    closeWithExit();
    return;
  }
  failWith(result.error || INVALID_KEY_MESSAGE);
}

/* ------------------------------------------------------------------ */
/* 事件绑定                                                            */
/* ------------------------------------------------------------------ */

input.addEventListener('focus', () => {
  // 错误态聚焦即清除 (spec §4)
  if (state === 'error') clearError();
});

input.addEventListener('input', () => {
  if (state === 'error') {
    clearError();
  } else if (state !== 'verifying') {
    setState(hasText() ? 'ready' : 'empty');
  }
});

input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    void submit();
  }
});

// ESC = 稍后再说 (全局生效, 焦点在输入框 / 按钮上均可)
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !closing) {
    event.preventDefault();
    closeWithExit();
  }
});

laterBtn.addEventListener('click', () => {
  closeWithExit();
});

submitBtn.addEventListener('click', () => {
  void submit();
});

// 掩码 / 明文切换 (spec §4 右侧眼睛): 图标 + aria 状态同步, 焦点留在输入框
let masked = true;
eyeToggle.addEventListener('click', () => {
  masked = !masked;
  input.type = masked ? 'password' : 'text';
  eyeToggle.setAttribute('aria-pressed', String(!masked));
  eyeToggle.setAttribute('aria-label', masked ? '显示 Key' : '隐藏 Key');
  eyeShowIcon.hidden = !masked;
  eyeHideIcon.hidden = masked;
  input.focus();
});

// 初始态: 聚焦输入框 (autofocus), 渲染 empty
input.focus();
render();
