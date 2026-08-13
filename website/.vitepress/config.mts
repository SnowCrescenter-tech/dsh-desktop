import { defineConfig } from 'vitepress'

const shared = {
  lastUpdated: false,
  cleanUrls: true,
  head: [['link', { rel: 'icon', href: '/whale.svg' }]],
  themeConfig: {
    logo: { light: '/whale.svg', dark: '/whale-dark.svg', alt: 'dsh-desktop' },
    search: {
      provider: 'local',
      options: {
        locales: {
          zh: {
            translations: {
              button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
              modal: {
                displayDetails: '显示详细结果',
                resetButtonTitle: '清除',
                backButtonTitle: '返回',
                noResultsText: '没有找到相关结果',
                footer: {
                  selectText: '选择',
                  navigateText: '切换',
                  closeText: '关闭',
                },
              },
            },
          },
        },
      },
    },
  },
}

export default defineConfig({
  ...shared,
  lang: 'zh-CN',
  title: 'dsh-desktop',
  description: 'DeepSeek Harness 桌面版 —— 双击就能用上 DeepSeek Harness',
  locales: {
    zh: {
      label: '简体中文',
      lang: 'zh-CN',
      link: '/zh/',
      themeConfig: {
        ...shared.themeConfig,
        outline: { label: '本页目录', level: [2, 3] },
        docFooter: { prev: '上一篇', next: '下一篇' },
        darkModeSwitchLabel: '深色模式',
        lightModeSwitchLabel: '浅色模式',
        returnToTopLabel: '回到顶部',
        sidebarMenuLabel: '菜单',
        nav: [
          { text: '首页', link: '/zh/' },
          { text: '快速开始', link: '/zh/guide/quickstart' },
          { text: '窗口与托盘', link: '/zh/guide/tray' },
          { text: '常见问题', link: '/zh/guide/faq' },
          { text: '技术说明', link: '/zh/tech' },
          { text: '免责声明', link: '/zh/disclaimer' },
        ],
        sidebar: [
          {
            text: '指南',
            items: [
              { text: '快速开始', link: '/zh/guide/quickstart' },
              { text: '窗口与托盘', link: '/zh/guide/tray' },
              { text: '常见问题', link: '/zh/guide/faq' },
            ],
          },
          {
            text: '更多',
            items: [
              { text: '技术说明', link: '/zh/tech' },
              { text: '免责声明', link: '/zh/disclaimer' },
            ],
          },
        ],
        socialLinks: [
          { icon: 'github', link: 'https://github.com/deepseek-ai/deepseek-harness' },
        ],
      },
    },
    en: {
      label: 'English',
      lang: 'en-US',
      link: '/en/',
      themeConfig: {
        ...shared.themeConfig,
        outline: { label: 'On this page', level: [2, 3] },
        docFooter: { prev: 'Previous', next: 'Next' },
        darkModeSwitchLabel: 'Appearance',
        lightModeSwitchLabel: 'Appearance',
        returnToTopLabel: 'Back to top',
        sidebarMenuLabel: 'Menu',
        nav: [
          { text: 'Home', link: '/en/' },
          { text: 'Quick start', link: '/en/guide/quickstart' },
          { text: 'Window & tray', link: '/en/guide/tray' },
          { text: 'FAQ', link: '/en/guide/faq' },
          { text: 'Tech notes', link: '/en/tech' },
          { text: 'Disclaimer', link: '/en/disclaimer' },
        ],
        sidebar: [
          {
            text: 'Guide',
            items: [
              { text: 'Quick start', link: '/en/guide/quickstart' },
              { text: 'Window & tray', link: '/en/guide/tray' },
              { text: 'FAQ', link: '/en/guide/faq' },
            ],
          },
          {
            text: 'More',
            items: [
              { text: 'Tech notes', link: '/en/tech' },
              { text: 'Disclaimer', link: '/en/disclaimer' },
            ],
          },
        ],
        socialLinks: [
          { icon: 'github', link: 'https://github.com/deepseek-ai/deepseek-harness' },
        ],
      },
    },
  },
})
