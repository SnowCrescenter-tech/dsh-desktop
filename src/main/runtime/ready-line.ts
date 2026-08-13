/**
 * dsh CLI 就绪行解析。
 *
 * dsh CLI 在服务就绪时向 stdout 打印一行:
 *   `dsh web: http://127.0.0.1:<port>`
 * 可选地携带 LAN 后缀:
 *   `dsh web: http://127.0.0.1:<port> (LAN: http://<ip>:<port>)`
 *
 * 解析策略:整行精确匹配(锚定 ^ 与 $),避免误命中日志/进度等无关输出;
 * LAN 后缀整体宽容匹配,其内部 host/port 不参与结果,主行的 port 才是有效值。
 */

/** 就绪信息:服务监听地址与端口 */
export interface ReadyInfo {
  host: string;
  port: number;
}

// 分组 1 = host,分组 2 = 主端口;LAN 后缀是可选整段,只做外观匹配不捕获内容
const READY_LINE_RE =
  /^dsh web: http:\/\/([^/:\s]+):(\d{1,5})(?: \(LAN: http:\/\/[^/:\s]+:\d{1,5}\))?$/;

/**
 * 解析一行 stdout 输出。
 *
 * @param line 单行文本(不含换行符;含 \r / 首尾空白也能容忍)
 * @returns 就绪信息;该行不是有效就绪行时返回 null
 */
export function parseReadyLine(line: string): ReadyInfo | null {
  const match = READY_LINE_RE.exec(line.trim());
  if (match === null) {
    return null;
  }
  const host = match[1];
  const portText = match[2];
  // 正则命中即必然存在,这里仅用于类型收窄 (noUncheckedIndexedAccess)
  if (host === undefined || portText === undefined) {
    return null;
  }
  const port = Number(portText);
  // \d{1,5} 最多匹配 5 位数字,需要真正的端口范围校验 (0 与越界都无效)
  if (port < 1 || port > 65535) {
    return null;
  }
  return { host, port };
}
