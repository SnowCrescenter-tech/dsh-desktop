import { defineConfig } from 'vitest/config'

// E2E 测试配置:boot-smoke 用例位于 tests/e2e/。
// node 环境即可 —— 测试 import 构建产物 dist/main/index.js 并在 electron
// 边界注入假实现 (无 GUI), 同时真实拉起假 dsh CLI 子进程, 因此放宽超时。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/e2e/**/*.test.ts'],
    passWithNoTests: false,
    // 真实子进程启动 + 状态轮询, 超出 vitest 默认 5s 单测超时
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
