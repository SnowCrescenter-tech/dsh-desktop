import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apply, resolveBridge, type Config, type DesktopBridge, type PluginContext, type WebCommand } from '../src/index';

/** 构造一个假 PluginContext，记录 slots.inject 的调用与取消 */
function makeContext() {
  const injections: Array<{ key: string; cleanup: () => void }> = [];
  const ctx: PluginContext = {
    slots: {
      inject(key: string, callback: () => () => void) {
        const cleanup = callback();
        injections.push({ key, cleanup });
        return () => {
          // 取消注入：执行 cleanup 并从记录移除
          cleanup();
          const idx = injections.findIndex((i) => i.cleanup === cleanup);
          if (idx >= 0) injections.splice(idx, 1);
        };
      },
    },
    logger: { warn: vi.fn() },
  };
  return { ctx, injections, warn: ctx.logger.warn };
}

const W = globalThis as {
  dshDesktop?: DesktopBridge;
  __dshDesktopCommand__?: (command: WebCommand) => void;
  dshDesktopNotify?: (payload: { title: string; body: string }) => Promise<void>;
};

beforeEach(() => {
  delete W.dshDesktop;
  delete W.__dshDesktopCommand__;
  delete W.dshDesktopNotify;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resolveBridge', () => {
  it('无 window.dshDesktop 时返回 null', () => {
    delete W.dshDesktop;
    expect(resolveBridge()).toBeNull();
  });

  it('存在时返回该对象', () => {
    W.dshDesktop = {};
    expect(resolveBridge()).toBe(W.dshDesktop);
  });
});

describe('apply', () => {
  const config: Config = { notify: true };

  it('无桥接时降级：仅打日志，不注册槽位、不暴露处理器', () => {
    delete W.dshDesktop;
    const { ctx, injections, warn } = makeContext();
    apply(ctx, config);
    expect(warn).toHaveBeenCalledOnce();
    expect(injections).toHaveLength(0);
    expect(W.__dshDesktopCommand__).toBeUndefined();
    expect(W.dshDesktopNotify).toBeUndefined();
  });

  it('有桥接时：仅调用声明的 native.notify（通过 notify 助手），不触碰其它方法', () => {
    const notify = vi.fn().mockResolvedValue(undefined);
    W.dshDesktop = { native: { notify } };
    const { ctx } = makeContext();
    apply(ctx, config);

    // Web → 原生：调用 notify
    expect(W.dshDesktopNotify).toBeTypeOf('function');
    void W.dshDesktopNotify?.({ title: 't', body: 'b' });
    expect(notify).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledWith({ title: 't', body: 'b' });
  });

  it('托盘命令路由：reload 触发 location.reload（show-about 派发 about 处理器）', () => {
    W.dshDesktop = { native: { notify: vi.fn() } };
    const { ctx } = makeContext();
    apply(ctx, config);

    // Node 测试环境无 location 全局，先 stub
    const reloadSpy = vi.fn();
    vi.stubGlobal('location', { reload: reloadSpy });

    const aboutSpy = vi.fn();
    (globalThis as { __dshDesktopAboutHandlers__?: Array<() => void> }).__dshDesktopAboutHandlers__ = [aboutSpy];

    W.__dshDesktopCommand__?.({ command: 'reload' });
    expect(reloadSpy).toHaveBeenCalledOnce();

    W.__dshDesktopCommand__?.({ command: 'show-about' });
    expect(aboutSpy).toHaveBeenCalledOnce();

    vi.unstubAllGlobals();
  });

  it('槽位注册/销毁对称：inject 返回的取消函数会清理注入', () => {
    W.dshDesktop = { native: { notify: vi.fn() } };
    const { ctx, injections } = makeContext();
    apply(ctx, config);

    expect(injections).toHaveLength(1);
    expect(injections[0]?.key).toBe('root');

    // 拿到 inject 的取消函数（重新捕获：apply 里调用了 ctx.slots.inject，其返回值未被保存，
    // 这里通过重新 apply 到可跟踪的 fake 来验证对称性）
    const unsubscribers: Array<() => void> = [];
    const trackingCtx: PluginContext = {
      slots: {
        inject(key: string, cb: () => () => void) {
          const cleanup = cb();
          unsubscribers.push(cleanup);
          return () => cleanup();
        },
      },
      logger: { warn: vi.fn() },
    };
    apply(trackingCtx, config);
    expect(unsubscribers).toHaveLength(1);
    expect(W.__dshDesktopCommand__).toBeTypeOf('function');

    unsubscribers[0]?.(); // 模拟槽位卸载
    expect(W.__dshDesktopCommand__).toBeUndefined();
    expect(W.dshDesktopNotify).toBeUndefined();
  });
});
