/**
 * dsh-desktop 开机自启 —— 注入式 Windows 注册表 Run 键读写 (设计规范 §3.2)。
 *
 * 通过 `reg query` / `reg add` / `reg delete` 维护
 * `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` 下的 `dsh-desktop` 值。
 *
 * 分层:
 *   - `buildXxxArgs` / `buildRunCommand`: 纯函数, 精确拼出 reg 命令行与 Run 值;
 *   - `createRegExecutor`: 把 reg 退出码映射为布尔/成功 (注入命令运行器);
 *   - `createAutolaunch`: 开关逻辑, 只依赖注入的 `RegExecutor` (测试注入 mock);
 *   - 默认执行器经 `child_process.execFile` 调用系统 reg.exe (windowsHide 防黑窗)。
 *
 * 幂等约定: setEnabled 先读当前状态, 与目标一致时不下发任何写命令。
 */
import { execFile as nodeExecFile } from 'node:child_process';

/** 开机自启注册表键 (HKCU Run 键) */
export const AUTOLAUNCH_RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';

/** 开机自启注册表值名 */
export const AUTOLAUNCH_VALUE_NAME = 'dsh-desktop';

/** 注册表值类型 (REG_SZ = 单行字符串) */
const REG_SZ_TYPE = 'REG_SZ';

/** reg 的文档化退出码: 1 = 值不存在 (查询无匹配 / 删除目标缺失) */
const REG_NOT_FOUND_EXIT_CODE = 1;

/**
 * 注入的注册表执行器 —— 核心开关逻辑只依赖本接口, 不直接触碰 child_process。
 */
export interface RegExecutor {
  /** `reg query <key> /v <valueName>`; 值存在 (exit 0) 返回 true, 不存在 (exit 1) 返回 false */
  query(key: string, valueName: string): Promise<boolean>;
  /** `reg add <key> /v <valueName> /t REG_SZ /d <value> /f`; 写入/覆盖值 */
  add(key: string, valueName: string, value: string): Promise<void>;
  /** `reg delete <key> /v <valueName> /f`; 值本就不存在时也视为成功 (幂等删除) */
  delete(key: string, valueName: string): Promise<void>;
}

/** 注入的底层命令运行器: 执行 reg 参数数组, 返回进程退出码 */
export type RegCommandRunner = (args: string[]) => Promise<number>;

/** 开机自启服务 */
export interface Autolaunch {
  /** 查询是否已启用开机自启 */
  isEnabled(): Promise<boolean>;
  /** 设置开机自启; 与当前状态一致时为空操作 (幂等) */
  setEnabled(enabled: boolean): Promise<void>;
}

export interface AutolaunchDeps {
  /** 注册表执行器 (测试注入 mock) */
  reg: RegExecutor;
  /** 应用可执行文件路径; 组合根应传 `process.execPath`, 禁止硬编码 */
  appPath: string;
  /** 注册表键, 默认 `AUTOLAUNCH_RUN_KEY` */
  key?: string;
  /** 注册表值名, 默认 `AUTOLAUNCH_VALUE_NAME` */
  valueName?: string;
}

/** 构建 Run 值: 带引号的可执行文件路径 (路径含空格时引号是必需的) */
export function buildRunCommand(appPath: string): string {
  return `"${appPath}"`;
}

/** 构造 `reg query` 参数 */
export function buildQueryArgs(key: string, valueName: string): string[] {
  return [key, '/v', valueName];
}

/** 构造 `reg add` 参数 (含 /t 类型与 /f 强制覆盖) */
export function buildAddArgs(key: string, valueName: string, value: string): string[] {
  return [key, '/v', valueName, '/t', REG_SZ_TYPE, '/d', value, '/f'];
}

/** 构造 `reg delete` 参数 (/f 静默删除) */
export function buildDeleteArgs(key: string, valueName: string): string[] {
  return [key, '/v', valueName, '/f'];
}

/** 默认 reg 命令运行器: execFile 调用系统 reg.exe, 收敛为退出码 */
function runRegCommand(args: string[]): Promise<number> {
  return new Promise((resolve) => {
    nodeExecFile('reg', args, { windowsHide: true }, (error) => {
      if (error === null) {
        resolve(0);
        return;
      }
      // error.code 可能是数字退出码, 也可能是 'ENOENT' 等字符串; 非数字一律视为失败
      resolve(typeof error.code === 'number' ? error.code : 1);
    });
  });
}

/** 基于命令运行器构造注册表执行器 (退出码 → 语义) */
export function createRegExecutor(runner: RegCommandRunner): RegExecutor {
  return {
    async query(key, valueName) {
      const code = await runner(buildQueryArgs(key, valueName));
      if (code === 0) {
        return true;
      }
      if (code === REG_NOT_FOUND_EXIT_CODE) {
        return false;
      }
      throw new Error(`reg query 意外退出: exit code=${code}`);
    },
    async add(key, valueName, value) {
      const code = await runner(buildAddArgs(key, valueName, value));
      if (code !== 0) {
        throw new Error(`reg add 失败: exit code=${code}`);
      }
    },
    async delete(key, valueName) {
      const code = await runner(buildDeleteArgs(key, valueName));
      // exit 1 = 值本就不存在; 删除要求幂等, 视为成功
      if (code !== 0 && code !== REG_NOT_FOUND_EXIT_CODE) {
        throw new Error(`reg delete 失败: exit code=${code}`);
      }
    },
  };
}

/** 默认注册表执行器 (包装系统 reg.exe) */
export function createDefaultRegExecutor(): RegExecutor {
  return createRegExecutor(runRegCommand);
}

/** 创建开机自启服务 (组合根可消费) */
export function createAutolaunch(deps: AutolaunchDeps): Autolaunch {
  const key = deps.key ?? AUTOLAUNCH_RUN_KEY;
  const valueName = deps.valueName ?? AUTOLAUNCH_VALUE_NAME;

  return {
    isEnabled() {
      return deps.reg.query(key, valueName);
    },
    async setEnabled(enabled) {
      const current = await deps.reg.query(key, valueName);
      // 幂等: 目标状态与当前一致时不触发任何注册表写命令
      if (current === enabled) {
        return;
      }
      if (enabled) {
        await deps.reg.add(key, valueName, buildRunCommand(deps.appPath));
      } else {
        await deps.reg.delete(key, valueName);
      }
    },
  };
}
