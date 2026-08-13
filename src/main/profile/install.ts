/**
 * dsh-desktop 插件安装 — 离线优先。
 *
 * 把 @dsh-desktop/client 的构建产物 (lib/ 与 package.json) 复制到
 * desktop profile 的 node_modules (dsh 运行时从该处装载 bundle);
 * 仅当离线产物缺失、且提供了 tgz 打包产物与 pnpm 时, 才回退到
 * `dsh plugin --profile desktop add <tgz>`。
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { DESKTOP_PROFILE_NAME } from './bootstrap.js';

/** 桌面客户端插件包名 (desktop profile 的第三个 bundle) */
export const CLIENT_PACKAGE_NAME = '@dsh-desktop/client';

/** installPlugin 的输入 */
export interface InstallPluginOptions {
  /** DSH_HOME 根; profile 目录为 <dshHome>/profiles/desktop */
  dshHome: string;
  /** @dsh-desktop/client 的源码根 (含 lib/ 与 package.json) */
  pluginRoot: string;
  /** resources/plugins 下的 tgz 打包产物 (回退路径使用, 建议传绝对路径) */
  pluginTarball?: string;
  /** 捆绑 dsh CLI 的入口 (resolveBinJs 的结果; 回退路径使用) */
  dshBinJs?: string;
}

/** 安装方式: offline = 复制 lib/; dsh-plugin = 回退到 dsh plugin add */
export type InstallMethod = 'offline' | 'dsh-plugin';

export interface InstallPluginResult {
  method: InstallMethod;
  /** 插件在 profile node_modules 中的安装目录 */
  installedDir: string;
}

/** @dsh-desktop/client 在 desktop profile node_modules 中的目标目录 */
export function pluginTargetDir(dshHome: string): string {
  return join(
    dshHome,
    'profiles',
    DESKTOP_PROFILE_NAME,
    'node_modules',
    CLIENT_PACKAGE_NAME,
  );
}

/**
 * 离线安装: 把 lib/ 的内容与 package.json 复制到目标目录。
 * 目录不存在 (无构建产物) 时返回 false, 不产生任何副作用。
 */
export function copyPluginLib(pluginRoot: string, target: string): boolean {
  const libDir = join(pluginRoot, 'lib');
  if (!existsSync(libDir) || !statSync(libDir).isDirectory()) {
    return false;
  }
  mkdirSync(target, { recursive: true });
  cpSync(libDir, target, { recursive: true });
  // 节点模块解析与 dsh bundle 装载都要读 package.json (含 dsh.bundle.patch 声明)
  const manifestPath = join(pluginRoot, 'package.json');
  if (existsSync(manifestPath)) {
    cpSync(manifestPath, join(target, 'package.json'));
  }
  return true;
}

/** 可注入依赖, 便于测试替换 pnpm 探测与实际 CLI 执行 */
export interface InstallDeps {
  hasPnpm: () => boolean;
  runDshPluginAdd: (binJs: string, profile: string, tarball: string) => void;
}

/** 默认实现: pnpm --version 探测; `node <bin.js> plugin --profile <name> add <tgz>` */
export const defaultDeps: InstallDeps = {
  hasPnpm(): boolean {
    // Windows 上 pnpm 是 .cmd 垫片, spawn 需 shell; 参数为固定常量, 无注入风险
    const probe = spawnSync('pnpm', ['--version'], {
      stdio: 'ignore',
      shell: process.platform === 'win32',
    });
    return probe.status === 0;
  },
  runDshPluginAdd(binJs: string, profile: string, tarball: string): void {
    // node.exe 是真实可执行文件, 直接数组传参 (路径含空格也安全)
    const result = spawnSync(
      process.execPath,
      [binJs, 'plugin', '--profile', profile, 'add', tarball],
      { stdio: 'inherit' },
    );
    if (result.status !== 0) {
      throw new Error(
        `dsh plugin add 失败 (exit ${result.status ?? 'unknown'}): ` +
          `node ${binJs} plugin --profile ${profile} add ${tarball}`,
      );
    }
  },
};

/**
 * 安装 @dsh-desktop/client 到 desktop profile。
 * 优先离线复制 lib/; 否则在 tgz 与 pnpm 都可用时回退到 dsh plugin add。
 *
 * @throws 离线不可用且无法回退时抛错
 */
export function installPlugin(
  opts: InstallPluginOptions,
  deps: InstallDeps = defaultDeps,
): InstallPluginResult {
  const installedDir = pluginTargetDir(opts.dshHome);

  if (copyPluginLib(opts.pluginRoot, installedDir)) {
    return { method: 'offline', installedDir };
  }

  if (opts.pluginTarball === undefined || opts.dshBinJs === undefined) {
    throw new Error(
      `插件 ${CLIENT_PACKAGE_NAME} 缺少 lib/ 构建产物, 且未提供 tgz/bin.js, 无法安装`,
    );
  }
  if (!deps.hasPnpm()) {
    throw new Error(`插件 ${CLIENT_PACKAGE_NAME} 缺少 lib/ 构建产物且 pnpm 不可用, 无法回退到 dsh plugin add`);
  }

  deps.runDshPluginAdd(opts.dshBinJs, DESKTOP_PROFILE_NAME, opts.pluginTarball);
  return { method: 'dsh-plugin', installedDir };
}
