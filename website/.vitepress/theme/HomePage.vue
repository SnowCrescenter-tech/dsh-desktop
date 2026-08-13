<script setup lang="ts">
import { computed } from 'vue'
import { useData, withBase } from 'vitepress'
import WhaleMark from './WhaleMark.vue'
import WindowMock from './WindowMock.vue'

const { page } = useData()
const fm = computed(() => page.value.frontmatter as Record<string, any>)

const ICONS: Record<string, string> = {
  window: '<path d="M3.5 5.5h17v13h-17z"/><path d="M3.5 9.5h17"/>',
  tray: '<path d="M4 8V5.5h16V8"/><path d="M4 8l1.5 10h13L20 8"/><path d="M10 12h4"/>',
  bell: '<path d="M6 9.5a6 6 0 1 1 12 0c0 3.5 1.5 5 2 5.5H4c.5-.5 2-2 2-5.5Z"/><path d="M10 18.5a2 2 0 0 0 4 0"/>',
  single: '<rect x="3.5" y="3.5" width="12" height="12" rx="2"/><path d="M8.5 14.5V18a2 2 0 0 0 2 2h7.5a2 2 0 0 0 2-2v-7.5a2 2 0 0 0-2-2h-3.5"/>',
  power: '<path d="M12 3v8"/><path d="M6.3 6.3a7.5 7.5 0 1 0 11.4 0"/>',
  key: '<circle cx="7.5" cy="12" r="3.5"/><path d="M11 12h9.5"/><path d="M17 12v3.5"/><path d="M13.5 15.5h3.5"/>',
}
</script>

<template>
  <div class="ds-home">
    <section class="ds-hero">
      <div class="ds-hero__chip">
        <WhaleMark :size="26" />
      </div>
      <h1 class="ds-hero__title">{{ fm.hero?.title }}</h1>
      <p class="ds-hero__tagline">{{ fm.hero?.tagline }}</p>
      <p class="ds-hero__subtitle">{{ fm.hero?.subtitle }}</p>
      <div class="ds-hero__actions">
        <a class="ds-btn ds-btn--primary" :href="withBase(fm.hero?.ctaPrimary?.href ?? '/')">
          {{ fm.hero?.ctaPrimary?.text }}
        </a>
        <a
          class="ds-btn ds-btn--ghost"
          :href="fm.hero?.ctaSecondary?.href ?? 'https://github.com/deepseek-ai/deepseek-harness'"
          target="_blank"
          rel="noopener"
        >
          {{ fm.hero?.ctaSecondary?.text }}
        </a>
      </div>
      <p class="ds-hero__meta">{{ fm.hero?.meta }}</p>
    </section>

    <section class="ds-showcase">
      <div class="ds-showcase__frame">
        <WindowMock />
      </div>
    </section>

    <section class="ds-features" v-if="fm.features?.length">
      <h2 class="ds-section-title">{{ fm.featuresTitle }}</h2>
      <div class="ds-grid">
        <article v-for="f in fm.features" :key="f.title" class="ds-card">
          <div class="ds-card__icon" v-html="ICONS[f.icon] ?? ICONS.window"></div>
          <h3 class="ds-card__title">{{ f.title }}</h3>
          <p class="ds-card__desc">{{ f.desc }}</p>
        </article>
      </div>
    </section>

    <section class="ds-steps" v-if="fm.steps?.length">
      <h2 class="ds-section-title">{{ fm.stepsTitle }}</h2>
      <ol class="ds-steps__list">
        <li v-for="(s, i) in fm.steps" :key="s.title" class="ds-step">
          <span class="ds-step__num">{{ i + 1 }}</span>
          <div class="ds-step__body">
            <h3 class="ds-step__title">{{ s.title }}</h3>
            <p class="ds-step__desc">{{ s.desc }}</p>
          </div>
        </li>
      </ol>
    </section>

    <footer class="ds-footer">
      <p>{{ fm.footer }}</p>
    </footer>
  </div>
</template>

<style scoped>
.ds-home {
  --ds-content: 1080px;
  padding: 72px 24px 0;
}

.ds-hero {
  max-width: var(--ds-content);
  margin: 0 auto;
  text-align: center;
  padding: 40px 0 8px;
  animation: ds-in 140ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.ds-hero__chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 12px;
  background: var(--ds-accent-subtle);
  color: var(--ds-accent);
  margin-bottom: 28px;
}

.ds-hero__title {
  font-family: var(--ds-font-display);
  font-size: clamp(30px, 5vw, 46px);
  font-weight: 600;
  line-height: 1.25;
  letter-spacing: -0.015em;
  color: var(--vp-c-text-1);
  margin: 0;
}

.ds-hero__tagline {
  font-family: var(--ds-font-display);
  font-size: clamp(17px, 2.4vw, 22px);
  font-weight: 500;
  line-height: 1.5;
  color: var(--ds-accent);
  margin: 14px auto 0;
  max-width: 640px;
}

.ds-hero__subtitle {
  font-size: 15px;
  line-height: 1.8;
  color: var(--vp-c-text-2);
  max-width: 620px;
  margin: 18px auto 0;
}

.ds-hero__actions {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 32px;
}

.ds-hero__meta {
  font-size: 12px;
  color: var(--vp-c-text-3);
  margin-top: 22px;
  letter-spacing: 0.02em;
}

.ds-showcase {
  max-width: var(--ds-content);
  margin: 64px auto 0;
}

.ds-showcase__frame {
  max-width: 760px;
  margin: 0 auto;
  padding: 28px;
  border: 1px solid var(--ds-hairline);
  border-radius: 12px;
  background: var(--ds-bg-window);
}

.ds-features {
  max-width: var(--ds-content);
  margin: 96px auto 0;
}

.ds-section-title {
  font-family: var(--ds-font-display);
  font-size: 24px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--vp-c-text-1);
  text-align: center;
  margin: 0 0 36px;
}

.ds-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.ds-card {
  border: 1px solid var(--ds-hairline);
  border-radius: 10px;
  background: var(--ds-bg-surface);
  padding: 24px;
  transition: background-color 100ms ease-out;
}

.ds-card:hover {
  background: var(--ds-bg-hover);
}

.ds-card__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: var(--ds-accent-subtle);
  color: var(--ds-accent);
}

.ds-card__icon :deep(svg) {
  width: 22px;
  height: 22px;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
}

.ds-card__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--vp-c-text-1);
  margin: 16px 0 8px;
}

.ds-card__desc {
  font-size: 13.5px;
  line-height: 1.7;
  color: var(--vp-c-text-2);
  margin: 0;
}

.ds-steps {
  max-width: var(--ds-content);
  margin: 96px auto 0;
}

.ds-steps__list {
  list-style: none;
  margin: 0;
  padding: 0;
  counter-reset: ds;
}

.ds-step {
  display: flex;
  gap: 20px;
  align-items: flex-start;
  padding: 20px 24px;
  border: 1px solid var(--ds-hairline);
  border-radius: 10px;
  background: var(--ds-bg-surface);
  margin-bottom: 12px;
}

.ds-step__num {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  border: 1px solid var(--ds-hairline);
  color: var(--ds-accent);
  font-size: 13px;
  font-weight: 600;
  margin-top: 2px;
}

.ds-step__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--vp-c-text-1);
  margin: 0 0 6px;
}

.ds-step__desc {
  font-size: 13.5px;
  line-height: 1.7;
  color: var(--vp-c-text-2);
  margin: 0;
}

.ds-footer {
  max-width: var(--ds-content);
  margin: 96px auto 0;
  padding: 20px 24px 96px;
  border-top: 1px solid var(--ds-hairline);
  text-align: center;
}

.ds-footer p {
  font-size: 12.5px;
  color: var(--vp-c-text-3);
  margin: 0;
}

@keyframes ds-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@media (max-width: 900px) {
  .ds-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 640px) {
  .ds-home {
    padding: 48px 16px 0;
  }
  .ds-grid {
    grid-template-columns: 1fr;
  }
  .ds-hero__actions {
    flex-direction: column;
    align-items: center;
  }
  .ds-btn {
    width: 100%;
    max-width: 280px;
    justify-content: center;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ds-hero {
    animation: none;
  }
}
</style>
