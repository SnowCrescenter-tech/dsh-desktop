/**
 * .env 文件写入 — 承接 v0.1 (dsh-launcher Write-DotEnv) 的语义,
 * 供主进程把 DeepSeek API Key 持久化到 harness 读取的 .env 文件。
 *
 * 语义:
 *   - 保留文件中已有的全部行; 已存在 DEEPSEEK_API_KEY= 行时整行替换,
 *     否则在文件末尾追加一行 DEEPSEEK_API_KEY=<key>;
 *   - 输出固定为 UTF-8 无 BOM (Node 的 dotenv 解析器会把 BOM 当作变量名的一部分,
 *     导致 DEEPSEEK_API_KEY 读取失败), 故使用 writeFileSync 的 'utf8' 编码;
 *   - 只写入 / 替换 DEEPSEEK_API_KEY= 行, 绝不写入或改动保留键行:
 *     DEEPSEEK_BASE_URL 与 DSH_* 是 harness 的 bootstrap-only 保留名,
 *     写进去会被 harness 拒绝。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** DEEPSEEK_API_KEY 行的标准前缀 */
export const API_KEY_LINE_PREFIX = 'DEEPSEEK_API_KEY=';

/** 首行可能残留的 UTF-8 BOM 字符 (U+FEFF) */
const BOM_CHAR = '\uFEFF';

/**
 * 把 DeepSeek API Key 写入 / 更新 .env 文件。
 *
 * @param filePath .env 文件的完整路径
 * @param key      要写入的 API Key (两侧空白自动去除)
 * @throws key 去空白后为空, 或包含换行时抛错并拒绝写入
 */
export function writeDotEnv(filePath: string, key: string): void {
  const trimmed = key.trim();
  if (trimmed === '') {
    throw new Error('API Key 为空, 拒绝写入 .env');
  }
  if (trimmed.includes('\n') || trimmed.includes('\r')) {
    throw new Error('API Key 包含换行, 拒绝写入 .env');
  }

  const newLine = `${API_KEY_LINE_PREFIX}${trimmed}`;
  const lines = readLines(filePath);

  // 逐行替换旧的 DEEPSEEK_API_KEY= 行 (保留其它所有行)
  let replaced = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line !== undefined && isKeyLine(line)) {
      lines[i] = newLine;
      replaced = true;
    }
  }
  // 没有旧行则在文件末尾追加
  if (!replaced) {
    lines.push(newLine);
  }

  const dir = dirname(filePath);
  if (dir !== '') {
    mkdirSync(dir, { recursive: true });
  }
  // 'utf8' 编码不会写入 BOM (EF BB BF), 与 dotenv 解析器兼容
  writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}

/**
 * 逐行读取文件: 不存在时返回空数组; 剔除首行残留的 BOM 字符;
 * 丢弃末尾换行符带来的空行 (保证追加时输出末尾只有单个换行)。
 */
function readLines(filePath: string): string[] {
  if (!existsSync(filePath)) {
    return [];
  }
  const content = readFileSync(filePath, 'utf8');
  if (content === '') {
    return [];
  }
  const lines = content.split(/\r?\n/);
  const first = lines[0];
  if (first !== undefined && first.startsWith(BOM_CHAR)) {
    lines[0] = first.slice(BOM_CHAR.length);
  }
  if (lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines;
}

/** 判断一行是否为 DEEPSEEK_API_KEY= 行 (忽略行首空白) */
function isKeyLine(line: string): boolean {
  return line.trim().startsWith(API_KEY_LINE_PREFIX);
}
