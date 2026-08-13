/**
 * AppSettings 存储的契约测试 — %LOCALAPPDATA%\dsh-desktop\settings.json。
 *
 * 关键不变量:
 *   - 写入为原子操作 (先写临时文件再 rename), 结束后不留临时文件;
 *   - 读取容错: 文件缺失 / JSON 损坏 / 字段非法一律回退默认值, 不抛异常;
 *   - 写后读回必须逐字段一致。
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  defaultSettings,
  readSettings,
  resolveSettingsDir,
  settingsFilePath,
  writeSettings,
  type AppSettings,
} from '../store.js';

/** 建临时目录, 返回 (目录, 清理函数) */
function makeTempDir(prefix: string): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return {
    dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

/** 一份完整合法设置的样本 */
const sampleSettings: AppSettings = {
  theme: 'dark',
  firstHideBalloonShown: true,
  autolaunchEnabled: true,
};

describe('resolveSettingsDir — 设置目录解析', () => {
  it('优先使用 %LOCALAPPDATA%', () => {
    expect(resolveSettingsDir({ LOCALAPPDATA: 'D:\\AppData\\Local' })).toBe(
      'D:\\AppData\\Local\\dsh-desktop',
    );
  });

  it('LOCALAPPDATA 缺失或空白时回退 <homedir>\\AppData\\Local\\dsh-desktop', () => {
    const fallback = resolveSettingsDir({});
    expect(fallback.endsWith(join('AppData', 'Local', 'dsh-desktop'))).toBe(true);
    expect(resolveSettingsDir({ LOCALAPPDATA: '   ' })).toBe(fallback);
  });
});

describe('settingsFilePath — 设置文件路径', () => {
  it('拼接 %LOCALAPPDATA% 下的 dsh-desktop\\settings.json', () => {
    expect(settingsFilePath({ LOCALAPPDATA: 'D:\\AppData\\Local' })).toBe(
      'D:\\AppData\\Local\\dsh-desktop\\settings.json',
    );
  });
});

describe('readSettings — 安全读取', () => {
  it('文件缺失时返回默认值', () => {
    const { dir, cleanup } = makeTempDir('dsh-store-');
    try {
      expect(readSettings(join(dir, 'settings.json'))).toEqual(defaultSettings());
    } finally {
      cleanup();
    }
  });

  it('JSON 损坏时回退默认值', () => {
    const { dir, cleanup } = makeTempDir('dsh-store-');
    try {
      const file = join(dir, 'settings.json');
      writeFileSync(file, '{ not valid json', 'utf8');
      expect(readSettings(file)).toEqual(defaultSettings());
    } finally {
      cleanup();
    }
  });

  it('字段类型非法时逐字段回退默认值', () => {
    const { dir, cleanup } = makeTempDir('dsh-store-');
    try {
      const file = join(dir, 'settings.json');
      writeFileSync(
        file,
        JSON.stringify({
          theme: 'neon',
          firstHideBalloonShown: 'yes',
          autolaunchEnabled: 1,
        }),
        'utf8',
      );
      expect(readSettings(file)).toEqual(defaultSettings());
    } finally {
      cleanup();
    }
  });

  it('缺失字段按默认值补齐 (兼容旧版本文件)', () => {
    const { dir, cleanup } = makeTempDir('dsh-store-');
    try {
      const file = join(dir, 'settings.json');
      writeFileSync(file, JSON.stringify({ theme: 'dark' }), 'utf8');
      expect(readSettings(file)).toEqual({
        theme: 'dark',
        firstHideBalloonShown: false,
        autolaunchEnabled: false,
      });
    } finally {
      cleanup();
    }
  });
});

describe('writeSettings — 原子写入', () => {
  it('写后读回逐字段一致', () => {
    const { dir, cleanup } = makeTempDir('dsh-store-');
    try {
      const file = join(dir, 'settings.json');
      writeSettings(sampleSettings, file);
      expect(readSettings(file)).toEqual(sampleSettings);
    } finally {
      cleanup();
    }
  });

  it('自动创建父目录', () => {
    const { dir, cleanup } = makeTempDir('dsh-store-');
    try {
      const file = join(dir, 'nested', 'settings.json');
      writeSettings(sampleSettings, file);
      expect(readSettings(file)).toEqual(sampleSettings);
    } finally {
      cleanup();
    }
  });

  it('结束后不留临时文件 (原子 rename)', () => {
    const { dir, cleanup } = makeTempDir('dsh-store-');
    try {
      writeSettings(defaultSettings(), join(dir, 'settings.json'));
      expect(readdirSync(dir)).toEqual(['settings.json']);
    } finally {
      cleanup();
    }
  });

  it('第二次写入覆盖旧值', () => {
    const { dir, cleanup } = makeTempDir('dsh-store-');
    try {
      const file = join(dir, 'settings.json');
      writeSettings(defaultSettings(), file);
      writeSettings(sampleSettings, file);
      expect(readSettings(file)).toEqual(sampleSettings);
    } finally {
      cleanup();
    }
  });
});
