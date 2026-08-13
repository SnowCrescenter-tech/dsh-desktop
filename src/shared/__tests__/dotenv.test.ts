/**
 * writeDotEnv 的契约测试 — .env 文件写入 (v0.1 dsh-launcher Write-DotEnv 语义)。
 *
 * 关键不变量:
 *   - 输出必须是 UTF-8 无 BOM (Node 的 dotenv 解析器会把 BOM 当成变量名的一部分,
 *     导致 DEEPSEEK_API_KEY 读取失败);
 *   - 保留文件中已有的全部其它行; 已存在 DEEPSEEK_API_KEY= 行时整行替换,
 *     否则在文件末尾追加;
 *   - 绝不写入 / 改动保留键行 (DEEPSEEK_BASE_URL 与 DSH_* 为 harness
 *     bootstrap-only, 写入会被 harness 拒绝)。
 */
import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { writeDotEnv } from '../dotenv.js';

/** UTF-8 BOM 的三字节序列 */
const BOM_BYTES = [0xef, 0xbb, 0xbf] as const;

/** 建临时目录, 返回 (目录, 清理函数) */
function makeTempDir(prefix: string): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return {
    dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

/**
 * 断言文件: 首三字节不是 BOM (EF BB BF), 且内容与期望逐字节一致 (无 \uFEFF 残留)。
 */
function expectFile(filePath: string, expectedContent: string): void {
  const bytes = readFileSync(filePath);
  expect([bytes[0], bytes[1], bytes[2]]).not.toEqual([...BOM_BYTES]);
  expect(bytes.toString('utf8')).toBe(expectedContent);
  expect(bytes.toString('utf8')).not.toContain('\uFEFF');
}

describe('writeDotEnv — .env 写入', () => {
  it('文件不存在时创建, 输出 UTF-8 无 BOM 且仅含 key 行', () => {
    const { dir, cleanup } = makeTempDir('dsh-dotenv-');
    try {
      const file = join(dir, '.env');
      writeDotEnv(file, 'sk-abc123');
      expectFile(file, 'DEEPSEEK_API_KEY=sk-abc123\n');
    } finally {
      cleanup();
    }
  });

  it('已存在 key 行时整行替换, 保留其它行', () => {
    const { dir, cleanup } = makeTempDir('dsh-dotenv-');
    try {
      const file = join(dir, '.env');
      writeFileSync(file, 'OTHER=1\nDEEPSEEK_API_KEY=old-key\nKEEP=2\n', 'utf8');
      writeDotEnv(file, 'sk-new-key');
      expectFile(file, 'OTHER=1\nDEEPSEEK_API_KEY=sk-new-key\nKEEP=2\n');
    } finally {
      cleanup();
    }
  });

  it('不存在 key 行时在末尾追加', () => {
    const { dir, cleanup } = makeTempDir('dsh-dotenv-');
    try {
      const file = join(dir, '.env');
      writeFileSync(file, 'OTHER=1\n', 'utf8');
      writeDotEnv(file, 'sk-abc123');
      expectFile(file, 'OTHER=1\nDEEPSEEK_API_KEY=sk-abc123\n');
    } finally {
      cleanup();
    }
  });

  it('空文件时追加 key 行', () => {
    const { dir, cleanup } = makeTempDir('dsh-dotenv-');
    try {
      const file = join(dir, '.env');
      writeFileSync(file, '', 'utf8');
      writeDotEnv(file, 'sk-abc123');
      expectFile(file, 'DEEPSEEK_API_KEY=sk-abc123\n');
    } finally {
      cleanup();
    }
  });

  it('保留 DEEPSEEK_BASE_URL / DSH_* 保留键行 (绝不写入或改动)', () => {
    const { dir, cleanup } = makeTempDir('dsh-dotenv-');
    try {
      const file = join(dir, '.env');
      writeFileSync(
        file,
        'DEEPSEEK_BASE_URL=https://api.deepseek.com\nDSH_HOME=D:/harness\nOTHER=1\n',
        'utf8',
      );
      writeDotEnv(file, 'sk-abc123');
      expectFile(
        file,
        'DEEPSEEK_BASE_URL=https://api.deepseek.com\nDSH_HOME=D:/harness\nOTHER=1\n' +
          'DEEPSEEK_API_KEY=sk-abc123\n',
      );
    } finally {
      cleanup();
    }
  });

  it('key 两侧空白被去除', () => {
    const { dir, cleanup } = makeTempDir('dsh-dotenv-');
    try {
      const file = join(dir, '.env');
      writeDotEnv(file, '  sk-abc123  ');
      expectFile(file, 'DEEPSEEK_API_KEY=sk-abc123\n');
    } finally {
      cleanup();
    }
  });

  it('空 key 抛错且不创建文件', () => {
    const { dir, cleanup } = makeTempDir('dsh-dotenv-');
    try {
      const file = join(dir, '.env');
      expect(() => writeDotEnv(file, '   ')).toThrow(/API Key 为空/);
      expect(existsSync(file)).toBe(false);
    } finally {
      cleanup();
    }
  });

  it('key 含换行抛错且文件保持不变', () => {
    const { dir, cleanup } = makeTempDir('dsh-dotenv-');
    try {
      const file = join(dir, '.env');
      writeFileSync(file, 'OTHER=1\nDEEPSEEK_API_KEY=sk-keep\n', 'utf8');
      expect(() => writeDotEnv(file, 'sk-abc\nEVIL=1')).toThrow(/API Key 包含换行/);
      expectFile(file, 'OTHER=1\nDEEPSEEK_API_KEY=sk-keep\n');
    } finally {
      cleanup();
    }
  });

  it('CRLF 行尾输入被规范化为 LF, 其它行内容保留', () => {
    const { dir, cleanup } = makeTempDir('dsh-dotenv-');
    try {
      const file = join(dir, '.env');
      writeFileSync(file, 'OTHER=1\r\nDEEPSEEK_API_KEY=sk-old\r\n', 'utf8');
      writeDotEnv(file, 'sk-new');
      expectFile(file, 'OTHER=1\nDEEPSEEK_API_KEY=sk-new\n');
    } finally {
      cleanup();
    }
  });

  it('存在多处旧 key 行时全部替换', () => {
    const { dir, cleanup } = makeTempDir('dsh-dotenv-');
    try {
      const file = join(dir, '.env');
      writeFileSync(file, 'DEEPSEEK_API_KEY=sk-a\nDEEPSEEK_API_KEY=sk-b\n', 'utf8');
      writeDotEnv(file, 'sk-c');
      expectFile(file, 'DEEPSEEK_API_KEY=sk-c\nDEEPSEEK_API_KEY=sk-c\n');
    } finally {
      cleanup();
    }
  });
});
