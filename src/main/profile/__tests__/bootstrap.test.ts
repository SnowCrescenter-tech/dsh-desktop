/**
 * buildProfileFiles 的契约测试 — 桌面 profile 清单 (package.json + cordis.patch.yml)。
 *
 * 关键不变量:
 *   - bundles 数组顺序精确 (base → web-app → 桌面客户端插件), 即装载顺序
 *   - manifest 字段齐全且固定 (name=desktop, private, dependencies={})
 *   - 纯函数: 相同输入产出逐字节一致的结果 (可快照)
 */
import { describe, expect, it } from 'vitest';

import {
  buildProfileFiles,
  DESKTOP_PROFILE_BUNDLES,
  EMPTY_CORDIS_PATCH,
  stringifyPackageJson,
} from '../bootstrap.js';

/** 测试用 DSH_HOME (Windows 风格, 仅参与路径拼接) */
const DSH_HOME = 'C:\\Users\\TestUser\\.dsh';

describe('buildProfileFiles — desktop profile 引导生成', () => {
  it('bundles 数组保持精确顺序: base → web-app → 桌面客户端插件', () => {
    const { packageJson } = buildProfileFiles(DSH_HOME);
    expect(packageJson.dsh.profile.bundles).toEqual([
      '@deepseek-ai/dsh-base',
      '@deepseek-ai/dsh-web-app',
      '@dsh-desktop/client',
    ]);
    // 与声明的常量一致 (防止手写数组与常量漂移)
    expect(packageJson.dsh.profile.bundles).toStrictEqual([...DESKTOP_PROFILE_BUNDLES]);
  });

  it('manifest 字段齐全: name/private/dependencies/dsh.profile', () => {
    const { packageJson } = buildProfileFiles(DSH_HOME);
    expect(packageJson.name).toBe('desktop');
    expect(packageJson.private).toBe(true);
    expect(packageJson.dependencies).toEqual({});
    expect(packageJson.dsh.profile.bundles).toHaveLength(3);
    // 未传 version 时不应出现 version 字段
    expect('version' in packageJson).toBe(false);
  });

  it('cordis.patch.yml 为空 patch 层 (与 dsh 空模板逐字节一致)', () => {
    const { cordisPatch } = buildProfileFiles(DSH_HOME);
    expect(cordisPatch).toBe(EMPTY_CORDIS_PATCH);
    expect(cordisPatch).toContain('[]');
    expect(cordisPatch.endsWith('\n')).toBe(true);
  });

  it('dir 指向 <dshHome>/profiles/desktop', () => {
    const { dir } = buildProfileFiles(DSH_HOME);
    expect(dir).toBe('C:\\Users\\TestUser\\.dsh\\profiles\\desktop');
  });

  it('序列化结果确定且为 npm 风格 (2 空格缩进 + 末尾换行)', () => {
    const text = stringifyPackageJson(buildProfileFiles(DSH_HOME).packageJson);
    const expected = [
      '{',
      '  "name": "desktop",',
      '  "private": true,',
      '  "dependencies": {},',
      '  "dsh": {',
      '    "profile": {',
      '      "bundles": [',
      '        "@deepseek-ai/dsh-base",',
      '        "@deepseek-ai/dsh-web-app",',
      '        "@dsh-desktop/client"',
      '      ]',
      '    }',
      '  }',
      '}',
      '',
    ].join('\n');
    expect(text).toBe(expected);
  });

  it('确定性: 相同输入两次生成的结果完全一致 (可快照)', () => {
    const a = buildProfileFiles(DSH_HOME);
    const b = buildProfileFiles(DSH_HOME);
    expect(stringifyPackageJson(a.packageJson)).toBe(stringifyPackageJson(b.packageJson));
    expect(a.cordisPatch).toBe(b.cordisPatch);
    expect(a.dir).toBe(b.dir);
  });

  it('version 可选: 传入才写入, 且序列化后仍是合法 JSON', () => {
    const withVersion = buildProfileFiles(DSH_HOME, { version: '1.2.3' });
    expect(withVersion.packageJson.version).toBe('1.2.3');

    const parsed = JSON.parse(
      stringifyPackageJson(buildProfileFiles(DSH_HOME).packageJson),
    ) as { dsh: { profile: { bundles: string[] } } };
    expect(parsed.dsh.profile.bundles).toEqual([...DESKTOP_PROFILE_BUNDLES]);
  });
});
