/**
 * dsh-desktop key store — DeepSeek API Key 的本机持久化 (读取侧)。
 *
 * 存储载体: `<dshHome>/.env`, 键名 DEEPSEEK_API_KEY。
 *   - 写入侧完全委托 src/shared/dotenv.ts 的 writeDotEnv (单一份 .env 语义);
 *   - 本模块只负责"读取" (readKey / hasKey) 与对外聚合的 writeKey 入口:
 *       - readKey / hasKey: 启动时判断"是否已配置 Key" (引导对话框显示条件, §4);
 *       - writeKey: 首次引导保存 Key (校验由调用方完成, 见 key-validation.ts)。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  API_KEY_LINE_PREFIX,
  writeDotEnv,
} from '../shared/dotenv.js';

/** .env 文件名 (位于 DSH_HOME 根目录) */
const ENV_FILE_NAME = '.env';

/** `<dshHome>/.env` 的绝对路径 */
export function keyEnvPath(dshHome: string): string {
  return join(dshHome, ENV_FILE_NAME);
}

/**
 * 读取已保存的 API Key (取 DEEPSEEK_API_KEY= 行的值, trim)。
 *
 * @param dshHome DSH_HOME 根目录
 * @returns 有有效 Key 返回其值, 无 Key 或文件不存在返回 null
 */
export function readKey(dshHome: string): string | null {
  let content: string;
  try {
    content = readFileSync(keyEnvPath(dshHome), 'utf8');
  } catch {
    return null; // 文件不存在视为未配置
  }
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim().startsWith(API_KEY_LINE_PREFIX)) continue;
    const value = line.slice(line.indexOf('=') + 1).trim();
    if (value !== '') return value;
  }
  return null;
}

/** 是否已保存过有效的 API Key (引导对话框的显示条件, spec §4) */
export function hasKey(dshHome: string): boolean {
  return readKey(dshHome) !== null;
}

/**
 * 保存 API Key 到 `<dshHome>/.env` (语义见 shared/dotenv.ts: 整行替换 /
 * 追加, 其余行原样保留, UTF-8 无 BOM)。
 *
 * @param dshHome DSH_HOME 根目录
 * @param key 已通过 validateKey 校验的 Key (写入前会 trim)
 */
export function writeKey(dshHome: string, key: string): void {
  writeDotEnv(keyEnvPath(dshHome), key);
}
