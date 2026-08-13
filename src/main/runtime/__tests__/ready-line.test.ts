import { describe, expect, it } from 'vitest';
import { parseReadyLine } from '../ready-line.js';

describe('parseReadyLine', () => {
  it('解析纯就绪行，提取 host 与 port', () => {
    expect(parseReadyLine('dsh web: http://127.0.0.1:8123')).toEqual({
      host: '127.0.0.1',
      port: 8123,
    });
  });

  it('解析带 LAN 后缀的就绪行，仍取主 host/port', () => {
    expect(
      parseReadyLine('dsh web: http://127.0.0.1:8123 (LAN: http://192.168.1.5:8123)'),
    ).toEqual({ host: '127.0.0.1', port: 8123 });
  });

  it('LAN 后缀端口不同时，取主行的端口', () => {
    expect(
      parseReadyLine('dsh web: http://127.0.0.1:8123 (LAN: http://192.168.1.5:9000)'),
    ).toEqual({ host: '127.0.0.1', port: 8123 });
  });

  it('容忍首尾空白（含 Windows 的 \\r\\n 行尾）', () => {
    expect(parseReadyLine('  dsh web: http://127.0.0.1:8123\r\n  ')).toEqual({
      host: '127.0.0.1',
      port: 8123,
    });
  });

  it('端口上限 65535 合法', () => {
    expect(parseReadyLine('dsh web: http://127.0.0.1:65535')?.port).toBe(65535);
  });

  it('垃圾行返回 null', () => {
    expect(parseReadyLine('hello world')).toBeNull();
    expect(parseReadyLine('')).toBeNull();
  });

  it('包含关键字的无关行返回 null（必须整行精确匹配）', () => {
    expect(parseReadyLine('prefix dsh web: http://127.0.0.1:8123')).toBeNull();
    expect(parseReadyLine('dsh web: http://127.0.0.1:8123 is not ready')).toBeNull();
    expect(
      parseReadyLine('dsh web: http://127.0.0.1:8123 (LAN: http://192.168.1.5:8123) extra'),
    ).toBeNull();
  });

  it('缺少端口返回 null', () => {
    expect(parseReadyLine('dsh web: http://127.0.0.1')).toBeNull();
  });

  it('端口为 0 或越界返回 null', () => {
    expect(parseReadyLine('dsh web: http://127.0.0.1:0')).toBeNull();
    expect(parseReadyLine('dsh web: http://127.0.0.1:65536')).toBeNull();
  });

  it('非 http 或非 dsh web 前缀不匹配', () => {
    expect(parseReadyLine('dsh web: https://127.0.0.1:8123')).toBeNull();
    expect(parseReadyLine('dsh api: http://127.0.0.1:8123')).toBeNull();
  });
});
