/**
 * key store 测试 — 读取侧 (readKey / hasKey) 与写入口 (writeKey, 委托 writeDotEnv)。
 *
 * 守护 spec §4 的门控语义:
 *   - hasKey = false 时启动弹出引导对话框; 保存后 hasKey = true, 下次启动不再弹出;
 *   - .env 写入语义 (整行替换 / 追加 / 保留其它行) 由 shared/dotenv 单测覆盖,
 *     此处只验证 key-store 与其衔接。
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { hasKey, keyEnvPath, readKey, writeKey } from '../key-store.js';

let tempDirs: string[] = [];

function makeHome(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-key-store-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

describe('readKey — 读取已保存的 API Key', () => {
  it('文件不存在时返回 null (视为未配置)', () => {
    expect(readKey(makeHome())).toBeNull();
    expect(hasKey(makeHome())).toBe(false);
  });

  it('从 DEEPSEEK_API_KEY= 行读取并 trim 值', () => {
    const home = makeHome();
    writeKey(home, 'sk-abc123');
    expect(readKey(home)).toBe('sk-abc123');
    expect(hasKey(home)).toBe(true);
  });

  it('容忍 Windows 的 \\r\\n 行尾', () => {
    const home = makeHome();
    writeKey(home, 'sk-abc123');
    const raw = readFileSync(keyEnvPath(home), 'utf8').replace(/\n/g, '\r\n');
    writeFileSync(keyEnvPath(home), raw, 'utf8');
    expect(readKey(home)).toBe('sk-abc123');
  });

  it('忽略注释行与其它变量, 只认 DEEPSEEK_API_KEY', () => {
    const home = makeHome();
    writeFileSync(
      keyEnvPath(home),
      '# comment\nDEEPSEEK_BASE_URL=https://api.deepseek.com\nDEEPSEEK_API_KEY=sk-abc123\nDSH_PORT=3080\n',
      'utf8',
    );
    expect(readKey(home)).toBe('sk-abc123');
  });

  it('值为空或全空白时视为未配置', () => {
    const home = makeHome();
    writeFileSync(keyEnvPath(home), 'DEEPSEEK_API_KEY=\n', 'utf8');
    expect(readKey(home)).toBeNull();
    expect(hasKey(home)).toBe(false);
  });
});

describe('writeKey — 保存 API Key (.env 写入口)', () => {
  it('首次写入创建 .env: DEEPSEEK_API_KEY=<key> + 末尾换行', () => {
    const home = makeHome();
    writeKey(home, 'sk-abc123');
    expect(readFileSync(keyEnvPath(home), 'utf8')).toBe('DEEPSEEK_API_KEY=sk-abc123\n');
  });

  it('重写时替换旧行, 保留其余行原样', () => {
    const home = makeHome();
    writeKey(home, 'sk-old');
    writeKey(home, 'sk-new');
    expect(readFileSync(keyEnvPath(home), 'utf8')).toBe('DEEPSEEK_API_KEY=sk-new\n');
  });

  it('保留文件中的注释与其它变量行 (只动 DEEPSEEK_API_KEY)', () => {
    const home = makeHome();
    writeFileSync(
      keyEnvPath(home),
      '# comment\nDEEPSEEK_API_KEY=sk-old\nDEEPSEEK_BASE_URL=https://api.deepseek.com\n',
      'utf8',
    );
    writeKey(home, 'sk-new');
    expect(readFileSync(keyEnvPath(home), 'utf8')).toBe(
      '# comment\nDEEPSEEK_API_KEY=sk-new\nDEEPSEEK_BASE_URL=https://api.deepseek.com\n',
    );
  });

  it('父目录不存在时自动创建', () => {
    const home = join(makeHome(), 'nested', 'data');
    writeKey(home, 'sk-abc123');
    expect(readKey(home)).toBe('sk-abc123');
  });

  it('写入前 trim 两侧空白 (委托 writeDotEnv)', () => {
    const home = makeHome();
    writeKey(home, '  sk-abc123  ');
    expect(readKey(home)).toBe('sk-abc123');
  });

  it('空 Key 拒绝写入并抛错 (与 writeDotEnv 语义一致)', () => {
    const home = makeHome();
    expect(() => writeKey(home, '   ')).toThrow(/API Key 为空/);
    expect(hasKey(home)).toBe(false);
  });
});
