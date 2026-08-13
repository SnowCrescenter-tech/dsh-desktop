import { defineConfig } from 'vitest/config'

// E2E 测试配置:当前尚无 E2E 用例,passWithNoTests 保证链路先行跑绿;
// 后续接入 Playwright 驱动真实 Electron 实例时,把用例放入 tests/e2e/ 即可。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/e2e/**/*.test.ts'],
    passWithNoTests: true,
  },
})
