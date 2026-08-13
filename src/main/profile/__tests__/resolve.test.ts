/**
 * 路径解析的契约测试 — DSH_HOME 解析 / 捆绑 dsh bin.js 定位 / resources/plugins 枚举。
 * 全部使用临时目录, 不触碰真实 $DSH_HOME。
 */
import { describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type * as NodeOs from 'node:os';

import {
  DSH_BIN_RELATIVE,
  resolveBinJs,
  resolveDshHome,
  resolvePluginTarballs,
} from '../resolve.js';

// 固定 homedir, 让回退路径测试确定 (tmpdir 等其余 API 保持真实)
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeOs>();
  return { ...actual, homedir: () => 'C:\\Users\\MockedUser' };
});

/** 建临时目录, 返回 (目录, 清理函数) */
function makeTempDir(prefix: string): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return {
    dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

/** 在 root 下建出 node_modules/@deepseek-ai/dsh/lib/bin.js, 返回其绝对路径 */
function seedBinJs(root: string): string {
  const binPath = join(root, DSH_BIN_RELATIVE);
  mkdirSync(dirname(binPath), { recursive: true });
  writeFileSync(binPath, '#!/usr/bin/env node\n');
  return binPath;
}

describe('resolveDshHome — DSH_HOME 解析', () => {
  it('优先使用 DSH_HOME 环境变量', () => {
    expect(resolveDshHome({ DSH_HOME: 'D:\\dsh-test\\home' })).toBe('D:\\dsh-test\\home');
  });

  it('DSH_HOME 为空白字符串时视为未设置, 回退到 <homedir>/.dsh', () => {
    expect(resolveDshHome({ DSH_HOME: '   ' })).toBe('C:\\Users\\MockedUser\\.dsh');
  });

  it('未设置 DSH_HOME 时回退到 <homedir>/.dsh (即 %USERPROFILE%\\.dsh)', () => {
    expect(resolveDshHome({})).toBe('C:\\Users\\MockedUser\\.dsh');
  });
});

describe('resolveBinJs — 定位捆绑的 dsh CLI', () => {
  it('在安装根找到 node_modules/@deepseek-ai/dsh/lib/bin.js', () => {
    const { dir, cleanup } = makeTempDir('dsh-bin-');
    try {
      const binPath = seedBinJs(dir);
      expect(resolveBinJs(dir)).toBe(binPath);
    } finally {
      cleanup();
    }
  });

  it('从任意子目录向上逐级查找 bin.js', () => {
    const { dir, cleanup } = makeTempDir('dsh-bin-');
    try {
      const binPath = seedBinJs(dir);
      const nested = join(dir, 'app', 'resources');
      mkdirSync(nested, { recursive: true });
      expect(resolveBinJs(nested)).toBe(binPath);
    } finally {
      cleanup();
    }
  });

  it('整棵目录树都不存在 bin.js 时抛错', () => {
    const { dir, cleanup } = makeTempDir('dsh-bin-');
    try {
      expect(() => resolveBinJs(dir)).toThrow(/未找到捆绑的 dsh CLI/);
    } finally {
      cleanup();
    }
  });
});

describe('resolvePluginTarballs — resources/plugins 枚举', () => {
  it('只列出 *.tgz, 并按文件名排序 (结果稳定)', () => {
    const { dir, cleanup } = makeTempDir('dsh-plugins-');
    try {
      writeFileSync(join(dir, 'readme.md'), '');
      writeFileSync(join(dir, 'z.tgz'), '');
      writeFileSync(join(dir, 'client-0.1.0.tgz'), '');
      writeFileSync(join(dir, 'a.tgz'), '');
      expect(resolvePluginTarballs(dir)).toEqual([
        join(dir, 'a.tgz'),
        join(dir, 'client-0.1.0.tgz'),
        join(dir, 'z.tgz'),
      ]);
    } finally {
      cleanup();
    }
  });

  it('目录不存在时返回空数组', () => {
    expect(resolvePluginTarballs(join(tmpdir(), 'no-such-plugins-dir-xyz'))).toEqual([]);
  });
});
