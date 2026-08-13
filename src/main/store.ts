/**
 * dsh-desktop 应用设置存储 — %LOCALAPPDATA%\dsh-desktop\settings.json。
 *
 * 负责三块跨会话状态:
 *   - theme: 界面主题偏好 (system / light / dark);
 *   - firstHideBalloonShown: 首次「关闭到托盘」气泡提示是否已展示;
 *   - autolaunchEnabled: 开机自启开关的本地缓存。
 *
 * 可靠性约定:
 *   - 写入采用「先写同目录临时文件 + 原子 rename」, 崩溃也不会留下半截 JSON;
 *   - 读取容错: 文件缺失 / JSON 损坏 / 字段类型非法一律回退默认值, 不抛异常。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/** 应用数据目录名 (位于 %LOCALAPPDATA% 之下) */
export const APP_DATA_DIR_NAME = 'dsh-desktop';

/** 设置文件名 */
export const SETTINGS_FILE_NAME = 'settings.json';

/** 原子写入时的临时文件名 (同目录, rename 到正式名) */
const SETTINGS_TMP_FILE = `${SETTINGS_FILE_NAME}.tmp`;

/** 界面主题偏好 */
export const themeValues = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof themeValues)[number];

/** 设置文件的完整结构 (单一事实来源) */
export interface AppSettings {
  theme: ThemePreference;
  /** 首次隐藏到托盘的气泡提示是否已展示 */
  firstHideBalloonShown: boolean;
  /** 开机自启开关的本地缓存 */
  autolaunchEnabled: boolean;
}

/** 全部字段的默认值 (新装 / 损坏回退) */
export function defaultSettings(): AppSettings {
  return {
    theme: 'system',
    firstHideBalloonShown: false,
    autolaunchEnabled: false,
  };
}

/**
 * 解析设置目录: 优先 %LOCALAPPDATA%\dsh-desktop;
 * 未设置或空白时回退 <用户主目录>\AppData\Local\dsh-desktop。
 *
 * @param env 测试可注入的环境变量表, 默认 process.env
 */
export function resolveSettingsDir(env: NodeJS.ProcessEnv = process.env): string {
  const localAppData = env['LOCALAPPDATA'];
  if (localAppData !== undefined && localAppData.trim() !== '') {
    return join(localAppData, APP_DATA_DIR_NAME);
  }
  return join(homedir(), 'AppData', 'Local', APP_DATA_DIR_NAME);
}

/** 设置文件的完整路径 */
export function settingsFilePath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveSettingsDir(env), SETTINGS_FILE_NAME);
}

/** theme 取值白名单判定 */
function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (themeValues as readonly string[]).includes(value);
}

/** 判断是否为普通对象 (排除 null 与数组) */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 把任意 JSON 值规整为 AppSettings: 缺失 / 非法字段一律回退默认值 */
function sanitizeSettings(value: unknown): AppSettings {
  const defaults = defaultSettings();
  if (!isRecord(value)) {
    return defaults;
  }
  const theme = value['theme'];
  const firstHideBalloonShown = value['firstHideBalloonShown'];
  const autolaunchEnabled = value['autolaunchEnabled'];
  return {
    theme: isThemePreference(theme) ? theme : defaults.theme,
    firstHideBalloonShown:
      typeof firstHideBalloonShown === 'boolean'
        ? firstHideBalloonShown
        : defaults.firstHideBalloonShown,
    autolaunchEnabled:
      typeof autolaunchEnabled === 'boolean'
        ? autolaunchEnabled
        : defaults.autolaunchEnabled,
  };
}

/**
 * 安全读取设置。文件缺失 / JSON 损坏 / 字段非法一律回退默认值, 不抛异常。
 *
 * @param filePath 设置文件路径, 默认 %LOCALAPPDATA%\dsh-desktop\settings.json
 */
export function readSettings(filePath: string = settingsFilePath()): AppSettings {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch {
    return defaultSettings();
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return sanitizeSettings(parsed);
  } catch {
    return defaultSettings();
  }
}

/**
 * 原子写入设置: 先写同目录临时文件, 再 rename 覆盖正式文件。
 * 任一步失败都会清理残留的临时文件后向上传播。
 *
 * @param settings 要持久化的设置
 * @param filePath 设置文件路径, 默认 %LOCALAPPDATA%\dsh-desktop\settings.json
 */
export function writeSettings(settings: AppSettings, filePath: string = settingsFilePath()): void {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });
  const tmpPath = join(dir, SETTINGS_TMP_FILE);
  try {
    writeFileSync(tmpPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
    renameSync(tmpPath, filePath);
  } catch (error) {
    try {
      if (existsSync(tmpPath)) {
        unlinkSync(tmpPath);
      }
    } catch {
      // 清理临时文件失败不掩盖原始错误
    }
    throw error;
  }
}
