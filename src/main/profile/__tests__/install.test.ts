/**
 * 插件安装的契约测试 — 离线复制 lib/ 优先, 回退 dsh plugin add。
 * 全部使用临时目录 + 注入依赖, 不执行真实 pnpm/dsh, 不触碰真实 $DSH_HOME。
 */
import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  CLIENT_PACKAGE_NAME,
  copyPluginLib,
  installPlugin,
  pluginTargetDir,
  type InstallDeps,
} from '../install.js';

/** 建临时目录, 返回 (目录, 清理函数) */
function makeTempDir(prefix: string): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return {
    dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

/** 造一个含 lib/ 与 package.json 的插件源码根 */
function seedPluginRoot(pluginRoot: string): void {
  mkdirSync(join(pluginRoot, 'lib'), { recursive: true });
  writeFileSync(join(pluginRoot, 'lib', 'index.js'), 'export const ok = true;\n');
  writeFileSync(
    join(pluginRoot, 'package.json'),
    JSON.stringify({ name: '@dsh-desktop/client', main: 'lib/index.js' }),
  );
}

describe('pluginTargetDir — 目标安装路径', () => {
  it('指向 <dshHome>/profiles/desktop/node_modules/@dsh-desktop/client', () => {
    const target = pluginTargetDir('D:\\dsh-home');
    expect(target).toBe('D:\\dsh-home\\profiles\\desktop\\node_modules\\@dsh-desktop\\client');
  });
});

describe('copyPluginLib — 离线复制', () => {
  it('复制 lib/ 内容与 package.json 到目标目录', () => {
    const { dir: pluginRoot, cleanup: cleanRoot } = makeTempDir('dsh-src-');
    const { dir: target, cleanup: cleanTarget } = makeTempDir('dsh-target-');
    try {
      seedPluginRoot(pluginRoot);
      expect(copyPluginLib(pluginRoot, target)).toBe(true);
      expect(existsSync(join(target, 'index.js'))).toBe(true);
      expect(readFileSync(join(target, 'package.json'), 'utf8')).toContain(
        CLIENT_PACKAGE_NAME,
      );
    } finally {
      cleanRoot();
      cleanTarget();
    }
  });

  it('源码根缺少 lib/ 时返回 false 且不复制任何内容', () => {
    const { dir: pluginRoot, cleanup: cleanRoot } = makeTempDir('dsh-src-');
    // mkdtempSync 本身会创建空目录, 断言其保持为空即证明未发生复制
    const { dir: target, cleanup: cleanTarget } = makeTempDir('dsh-target-');
    try {
      writeFileSync(join(pluginRoot, 'package.json'), '{}');
      expect(copyPluginLib(pluginRoot, target)).toBe(false);
      expect(readdirSync(target)).toEqual([]);
    } finally {
      cleanRoot();
      cleanTarget();
    }
  });
});

describe('installPlugin — 安装主流程', () => {
  it('离线优先: 有 lib/ 时复制到 profile node_modules, 不调用回退', () => {
    const { dir: dshHome, cleanup: cleanHome } = makeTempDir('dsh-home-');
    const { dir: pluginRoot, cleanup: cleanRoot } = makeTempDir('dsh-src-');
    try {
      seedPluginRoot(pluginRoot);
      const spy = { called: false };
      const deps: InstallDeps = {
        hasPnpm: () => true,
        runDshPluginAdd: () => {
          spy.called = true;
        },
      };
      const result = installPlugin({ dshHome, pluginRoot }, deps);
      expect(result.method).toBe('offline');
      expect(result.installedDir).toBe(
        join(dshHome, 'profiles', 'desktop', 'node_modules', '@dsh-desktop', 'client'),
      );
      expect(existsSync(join(result.installedDir, 'index.js'))).toBe(true);
      expect(spy.called).toBe(false);
    } finally {
      cleanHome();
      cleanRoot();
    }
  });

  it('无 lib/ 且未提供 tgz/bin.js 时抛错, 不产生任何写入', () => {
    const { dir: dshHome, cleanup: cleanHome } = makeTempDir('dsh-home-');
    const { dir: pluginRoot, cleanup: cleanRoot } = makeTempDir('dsh-src-');
    try {
      expect(() => installPlugin({ dshHome, pluginRoot })).toThrow(/缺少 lib\/.*tgz/);
      expect(existsSync(join(dshHome, 'profiles'))).toBe(false);
    } finally {
      cleanHome();
      cleanRoot();
    }
  });

  it('无 lib/ 但 pnpm 可用: 回退 dsh plugin --profile desktop add <tgz>', () => {
    const { dir: dshHome, cleanup: cleanHome } = makeTempDir('dsh-home-');
    const { dir: pluginRoot, cleanup: cleanRoot } = makeTempDir('dsh-src-');
    try {
      writeFileSync(join(pluginRoot, 'package.json'), '{}');
      const calls: Array<{ binJs: string; profile: string; tarball: string }> = [];
      const deps: InstallDeps = {
        hasPnpm: () => true,
        runDshPluginAdd: (binJs, profile, tarball) => {
          calls.push({ binJs, profile, tarball });
        },
      };
      const tarball = 'D:\\app\\resources\\plugins\\client-0.1.0.tgz';
      const binJs = 'D:\\app\\node_modules\\@deepseek-ai\\dsh\\lib\\bin.js';
      const result = installPlugin({ dshHome, pluginRoot, pluginTarball: tarball, dshBinJs: binJs }, deps);
      expect(result.method).toBe('dsh-plugin');
      expect(calls).toEqual([{ binJs, profile: 'desktop', tarball }]);
    } finally {
      cleanHome();
      cleanRoot();
    }
  });

  it('无 lib/ 且 pnpm 不可用时拒绝回退并抛错', () => {
    const { dir: dshHome, cleanup: cleanHome } = makeTempDir('dsh-home-');
    const { dir: pluginRoot, cleanup: cleanRoot } = makeTempDir('dsh-src-');
    try {
      writeFileSync(join(pluginRoot, 'package.json'), '{}');
      const deps: InstallDeps = {
        hasPnpm: () => false,
        runDshPluginAdd: () => {
          throw new Error('不应调用 dsh plugin add');
        },
      };
      expect(() =>
        installPlugin(
          {
            dshHome,
            pluginRoot,
            pluginTarball: 'D:\\app\\resources\\plugins\\x.tgz',
            dshBinJs: 'D:\\app\\node_modules\\@deepseek-ai\\dsh\\lib\\bin.js',
          },
          deps,
        ),
      ).toThrow(/pnpm 不可用/);
    } finally {
      cleanHome();
      cleanRoot();
    }
  });
});
