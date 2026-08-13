<script setup lang="ts">
// Pure-CSS mock of the dsh-desktop frameless shell: 36px drawn title bar,
// teal status dot, window controls and the webview content area.
// Static by design - the product itself never animates these.
</script>

<template>
  <div class="wmock" aria-hidden="true">
    <div class="wmock__bar">
      <span class="wmock__whale">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M2.6 13.2 C2.6 9, 5.2 5.4, 9.4 5.6 C12.6 5.8, 15 6.9, 17.2 7.9 C18.2 8.3, 19.2 8.2, 20.2 8.1 C20.7 8.7, 20.8 10.6, 20.3 12.9 C18 16, 14 17.7, 9.8 17.6 C6.1 17.4, 3.4 16.4, 2.6 13.2 Z"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <path d="M20.2 8.7 C21.9 7.7, 23 6.8, 23.8 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
          <path d="M20.2 12.6 C21.9 12.2, 23 12.5, 23.8 13.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
          <path d="M10.6 5.9 C10.9 4.3, 11.9 4.1, 11.8 2.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
          <circle cx="7.4" cy="10.6" r="1.2" fill="currentColor" />
        </svg>
      </span>
      <span class="wmock__name">DeepSeek Harness</span>
      <span class="wmock__dot" title="local service running"></span>
      <span class="wmock__controls">
        <span class="wmock__ctrl wmock__ctrl--min">&#x2013;</span>
        <span class="wmock__ctrl wmock__ctrl--max">&#x25A1;</span>
        <span class="wmock__ctrl wmock__ctrl--close">&#x2715;</span>
      </span>
    </div>
    <div class="wmock__body">
      <div class="wmock__row">
        <span class="wmock__line wmock__line--title"></span>
        <span class="wmock__chip"></span>
      </div>
      <div class="wmock__row">
        <span class="wmock__line wmock__line--long"></span>
        <span class="wmock__line wmock__line--short"></span>
      </div>
      <div class="wmock__row">
        <span class="wmock__line wmock__line--med"></span>
        <span class="wmock__line wmock__line--short"></span>
        <span class="wmock__line wmock__line--long"></span>
      </div>
      <div class="wmock__divider"></div>
      <div class="wmock__row">
        <span class="wmock__line wmock__line--short"></span>
        <span class="wmock__line wmock__line--long"></span>
      </div>
      <div class="wmock__row">
        <span class="wmock__line wmock__line--long"></span>
        <span class="wmock__line wmock__line--med"></span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wmock {
  width: 100%;
  border-radius: 8px;
  border: 1px solid var(--ds-hairline);
  box-shadow: var(--ds-shadow-dialog);
  overflow: hidden;
  background: var(--ds-bg-surface);
}

/* 36px drawn title bar, opaque */
.wmock__bar {
  display: flex;
  align-items: center;
  height: 36px;
  padding-left: 8px;
  background: var(--ds-bg-window);
  border-bottom: 1px solid var(--ds-hairline);
  user-select: none;
}

.wmock__whale {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ds-accent);
  width: 24px;
  height: 24px;
}

.wmock__name {
  font-size: 12px;
  font-weight: 500;
  color: var(--ds-text-secondary);
  margin-left: 8px;
}

/* status dot - teal, steady on purpose (calm, no pulse) */
.wmock__dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--ds-accent-teal);
  margin-left: 8px;
}

.wmock__controls {
  display: flex;
  margin-left: auto;
  height: 100%;
}

.wmock__ctrl {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 36px;
  font-size: 10px;
  color: var(--ds-text-tertiary);
}

.wmock__ctrl--min,
.wmock__ctrl--max {
  font-weight: 600;
}

.wmock__ctrl--close:hover {
  background: #d13438;
  color: #fff;
}

/* webview content area - neutral skeleton lines only */
.wmock__body {
  padding: 20px 20px 24px;
  background: var(--ds-bg-window);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.wmock__row {
  display: flex;
  gap: 12px;
  align-items: center;
}

.wmock__line {
  display: block;
  height: 8px;
  border-radius: 4px;
  background: var(--ds-line);
}

.wmock__line--title {
  width: 36%;
  height: 12px;
  background: var(--ds-line-strong);
}

.wmock__line--long {
  width: 42%;
}

.wmock__line--med {
  width: 28%;
}

.wmock__line--short {
  width: 18%;
}

.wmock__chip {
  width: 56px;
  height: 20px;
  border-radius: 6px;
  border: 1px solid var(--ds-hairline);
  background: var(--ds-bg-surface);
  margin-left: auto;
}

.wmock__divider {
  height: 1px;
  background: var(--ds-hairline);
}
</style>
