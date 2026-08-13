/**
 * validateKey 的契约测试 — DeepSeek API Key 校验规则。
 *
 * 规则 (与引导对话框约定一致):
 *   1. 去除两侧空白后必须非空;
 *   2. 必须以 `sk-` 前缀开头;
 *   3. 内部不允许空白或控制字符。
 * 校验通过时返回 trim 后的 key, 失败时返回可直接展示的中文错误。
 */
import { describe, expect, it } from 'vitest';

import { validateKey } from '../key-validation.js';

/** 断言输入必然校验失败, 且错误信息与期望一致 */
function expectFail(input: string, error: string): void {
  const result = validateKey(input);
  if (result.ok) {
    throw new Error(`预期 ${JSON.stringify(input)} 校验失败, 实际通过`);
  }
  expect(result.error).toBe(error);
}

describe('validateKey — API Key 校验', () => {
  it('通过标准 key: sk-abc123', () => {
    expect(validateKey('sk-abc123')).toEqual({ ok: true, key: 'sk-abc123' });
  });

  it('自动去除两侧空白后通过', () => {
    expect(validateKey('  sk-abc123  ')).toEqual({ ok: true, key: 'sk-abc123' });
    expect(validateKey('\tsk-abc123\n')).toEqual({ ok: true, key: 'sk-abc123' });
  });

  it('拒绝空字符串', () => {
    expectFail('', 'API Key 不能为空');
  });

  it('拒绝纯空白字符串', () => {
    expectFail('   ', 'API Key 不能为空');
    expectFail('\t\n', 'API Key 不能为空');
  });

  it('拒绝无 sk- 前缀的 key', () => {
    expectFail('foo', 'API Key 必须以 sk- 开头');
    expectFail('SK-abc123', 'API Key 必须以 sk- 开头');
  });

  it('拒绝内部空白 (空格 / 制表符 / 换行 / 回车)', () => {
    expectFail('sk-abc 123', 'API Key 不能包含空格或控制字符');
    expectFail('sk-abc\t123', 'API Key 不能包含空格或控制字符');
    expectFail('sk-abc\n123', 'API Key 不能包含空格或控制字符');
    expectFail('sk-abc\r123', 'API Key 不能包含空格或控制字符');
  });

  it('拒绝控制字符', () => {
    expectFail('sk-abc\u0000', 'API Key 不能包含空格或控制字符');
    expectFail('sk-abc\u001f', 'API Key 不能包含空格或控制字符');
    expectFail('sk-abc\u007f', 'API Key 不能包含空格或控制字符');
  });

  it('失败结果一律携带非空中文错误信息', () => {
    for (const input of ['', 'foo', 'sk-abc 123', 'sk-abc\u0007', '   ']) {
      const result = validateKey(input);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.length).toBeGreaterThan(0);
        // 错误信息必须是中文 (含 CJK 字符), 可直接展示给用户
        expect(result.error).toMatch(/[\u4e00-\u9fff]/);
      }
    }
  });
});
