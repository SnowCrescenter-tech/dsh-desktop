/**
 * DeepSeek API Key 校验 — 纯函数, 无任何 I/O 依赖。
 *
 * 可在主进程 (T15 的 onboarding:submit-key 处理器) 与渲染进程
 * (引导对话框输入校验) 共用同一套规则:
 *   1. 先 trim 去除两侧空白;
 *   2. 去除后必须非空;
 *   3. 必须以 `sk-` 前缀开头;
 *   4. 内部不允许空白或控制字符 (粘贴/输入噪声兜底)。
 * 校验通过时返回 trim 后的 key; 失败时返回可直接展示给用户的中文错误。
 */

/** DeepSeek API Key 的标准前缀 */
export const API_KEY_PREFIX = 'sk-';

/** 校验通过: 携带规范化 (trim 后) 的 key */
export interface KeyValidationOk {
  ok: true;
  key: string;
}

/** 校验失败: 携带可展示的中文错误 */
export interface KeyValidationFail {
  ok: false;
  error: string;
}

export type KeyValidationResult = KeyValidationOk | KeyValidationFail;

/**
 * 拒绝内部空白 (\s, 含空格/制表/换行/回车) 与控制字符
 * (\p{Cc} = Unicode 控制类, 覆盖 U+0000–U+001F、DEL U+007F 与 C1 U+0080–U+009F)。
 * 使用属性转义而非常量的控制字符范围, 以通过 no-control-regex 检查。
 */
const FORBIDDEN_CHARS = /[\s\p{Cc}]/u;

/**
 * 校验并规范化 API Key。
 *
 * @param input 用户粘贴/输入的原始字符串 (允许两侧多余空白)
 * @returns ok=true 时 key 为 trim 后的有效值; ok=false 时 error 为中文错误信息
 */
export function validateKey(input: string): KeyValidationResult {
  const key = input.trim();
  if (key === '') {
    return { ok: false, error: 'API Key 不能为空' };
  }
  if (!key.startsWith(API_KEY_PREFIX)) {
    return { ok: false, error: 'API Key 必须以 sk- 开头' };
  }
  if (FORBIDDEN_CHARS.test(key)) {
    return { ok: false, error: 'API Key 不能包含空格或控制字符' };
  }
  return { ok: true, key };
}
