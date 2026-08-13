<script setup lang="ts">
withDefaults(defineProps<{ size?: number | string }>(), { size: 24 })
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    class="whale-mark"
  >
    <!-- dsh-desktop whale glyph, inherits currentColor -->
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
</template>
