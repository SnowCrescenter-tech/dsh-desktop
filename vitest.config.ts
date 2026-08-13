import { defineConfig } from 'vitest/config'

// Vitest 单元测试配置 (node 环境)。
// main / shared 代码均为 Node 上下文,无需 jsdom;与 electron-vite 的构建配置互不干扰。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'src/**/*.test.ts', 'packages/**/*.test.ts'],
    passWithNoTests: false,
  },
})
