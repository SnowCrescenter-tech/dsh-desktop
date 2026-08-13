/**
 * dsh-desktop 桌面 profile 引导生成 — 纯函数、确定性、可快照。
 *
 * 生成 DeepSeek Harness 的 desktop profile 清单 (package.json + cordis.patch.yml),
 * 只返回内存对象, 不触碰磁盘。与 $DSH_HOME/profiles/web 的既有约定对齐:
 *   - name: 固定 "desktop"
 *   - dsh.profile.bundles: base → web-app → 桌面客户端插件 (顺序即装载顺序)
 *   - cordis.patch.yml: 空 patch 层 (与 dsh CLI 生成的空模板逐字节一致)
 */
import { join } from 'node:path';

/** desktop profile 的固定目录名 (与 profile 名一致) */
export const DESKTOP_PROFILE_NAME = 'desktop';

/**
 * desktop profile 装载的 bundle 列表。
 * 顺序不可变更: dsh 运行时按数组顺序逐层装载并合并 cordis 配置。
 */
export const DESKTOP_PROFILE_BUNDLES = [
  '@deepseek-ai/dsh-base',
  '@deepseek-ai/dsh-web-app',
  '@dsh-desktop/client',
] as const;

export type DesktopProfileBundle = (typeof DESKTOP_PROFILE_BUNDLES)[number];

/** bundle 列表是只读元组, 防止调用方篡改顺序 */
export type DesktopProfileBundles = readonly DesktopProfileBundle[];

/** 空 patch 层 — 与 dsh CLI 生成的空 cordis.patch.yml 逐字节一致 (末尾 LF) */
export const EMPTY_CORDIS_PATCH =
  [
    '# Your patch layer for this dsh profile, applied after every bundle layer:',
    '# a top-level YAML array of loader patch entries (id-targeted config',
    '# overrides, disables, and insert lists; `!!js` expressions allowed).',
    '[]',
  ].join('\n') + '\n';

/** buildProfileFiles 的可选参数 */
export interface BuildProfileOptions {
  /** 可选版本号; 传入则写入 package.json 的 version 字段 */
  version?: string;
}

/** desktop profile 的 package.json 结构 (类型即契约) */
export interface ProfilePackageJson {
  name: typeof DESKTOP_PROFILE_NAME;
  private: true;
  dependencies: Record<string, never>;
  dsh: {
    profile: {
      bundles: DesktopProfileBundles;
    };
  };
  version?: string;
}

/** buildProfileFiles 的返回: 全部为内存文件, 未落盘 */
export interface ProfileFiles {
  /** 结构化的 package.json (供断言与读取) */
  packageJson: ProfilePackageJson;
  /** cordis.patch.yml 的文本内容 */
  cordisPatch: string;
  /** profile 目录: <dshHome>/profiles/desktop */
  dir: string;
}

/** 将 profile manifest 序列化为 npm 风格文本 (2 空格缩进 + 末尾换行), 结果确定可快照 */
export function stringifyPackageJson(pkg: ProfilePackageJson): string {
  return `${JSON.stringify(pkg, null, 2)}\n`;
}

/**
 * 生成 desktop profile 的内存文件。
 *
 * @param dshHome DSH_HOME 根目录 (仅用于计算 dir, 不做 I/O)
 * @param opts    可选的版本号等
 */
export function buildProfileFiles(
  dshHome: string,
  opts: BuildProfileOptions = {},
): ProfileFiles {
  const packageJson: ProfilePackageJson = {
    name: DESKTOP_PROFILE_NAME,
    private: true,
    dependencies: {},
    dsh: {
      profile: {
        bundles: [...DESKTOP_PROFILE_BUNDLES],
      },
    },
    // exactOptionalPropertyTypes: 未传版本号时不要写入 version 字段
    ...(opts.version !== undefined ? { version: opts.version } : {}),
  };

  return {
    packageJson,
    cordisPatch: EMPTY_CORDIS_PATCH,
    dir: join(dshHome, 'profiles', DESKTOP_PROFILE_NAME),
  };
}
