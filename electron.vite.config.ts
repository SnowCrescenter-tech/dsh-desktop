import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { fileURLToPath } from 'node:url'

// electron-vite 三段式构建配置:main / preload / renderer 各自独立打包。
// 三段输出统一收敛到 dist/,而非 electron-vite 默认的 out/。
// 说明:
//   - main/preload 走 Node 上下文,依赖 (electron、node:*) 一律外部化,不打包进产物;
//   - renderer 是纯 Vite 构建,产物为静态 HTML/CSS/JS。
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/main',
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/preload',
    },
  },
  renderer: {
    build: {
      outDir: 'dist/renderer',
      // 多页面入口:主窗口页 + 36px 标题栏页 (设计规范 §3.1) + 引导对话框页 (§4)。
      // 后两者作为独立 HTML 页构建,由主进程按需加载。
      rollupOptions: {
        input: {
          index: fileURLToPath(new URL('src/renderer/index.html', import.meta.url)),
          titlebar: fileURLToPath(
            new URL('src/renderer/titlebar/index.html', import.meta.url),
          ),
          onboarding: fileURLToPath(
            new URL('src/renderer/onboarding/index.html', import.meta.url),
          ),
        },
      },
    },
  },
})
