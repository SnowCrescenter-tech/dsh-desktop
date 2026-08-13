/**
 * dsh-desktop 路径解析 — 定位捆绑的 dsh CLI 与桌面插件打包产物。
 * 全部为纯解析/只读探测, 不写磁盘。
 */
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/** 捆绑 dsh CLI 的入口, 相对其安装根 (包根) */
export const DSH_BIN_RELATIVE = join('node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');

/** 未设置 DSH_HOME 时, 默认数据目录名 */
export const DEFAULT_DSH_HOME_DIR_NAME = '.dsh';

/**
 * 解析 DSH_HOME 根目录。
 * 优先读取环境变量 DSH_HOME; 未设置或为空时回退到 <用户主目录>/.dsh
 * (Windows 即 %USERPROFILE%\.dsh)。
 *
 * @param env 测试可注入的环境变量表, 默认 process.env
 */
export function resolveDshHome(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env['DSH_HOME'];
  if (fromEnv !== undefined && fromEnv.trim() !== '') {
    return fromEnv;
  }
  return join(homedir(), DEFAULT_DSH_HOME_DIR_NAME);
}

/**
 * 定位捆绑的 dsh CLI 入口 (node_modules/@deepseek-ai/dsh/lib/bin.js)。
 *
 * 从 startDir 开始逐级向上查找第一个存在的 bin.js, 以适配打包后的应用把
 * 依赖内嵌在任意上层目录的场景。找不到时抛出带上下文的错误。
 */
export function resolveBinJs(startDir: string): string {
  let dir = startDir;
  for (;;) {
    const candidate = join(dir, DSH_BIN_RELATIVE);
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(
        `未找到捆绑的 dsh CLI: ${DSH_BIN_RELATIVE} (从 ${startDir} 向上查找均不存在)`,
      );
    }
    dir = parent;
  }
}

/** 返回 resources/plugins 目录下的全部 .tgz 打包产物 (按文件名排序, 结果稳定) */
export function resolvePluginTarballs(pluginsDir: string): string[] {
  if (!existsSync(pluginsDir)) {
    return [];
  }
  return readdirSync(pluginsDir)
    .filter((name) => name.endsWith('.tgz'))
    .sort()
    .map((name) => join(pluginsDir, name));
}
