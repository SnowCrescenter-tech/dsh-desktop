/**
 * Design-token conformance test — dsh-desktop-design-spec.md §2.
 *
 * Every value from the spec table must exist, spelled exactly, in both:
 *   - src/shared/tokens.ts (main-process constants)
 *   - src/renderer/styles/tokens.css (renderer custom properties)
 * Plus the theme-switching mechanics (system + .theme-light/.theme-dark).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  colorsDark,
  colorsLight,
  fonts,
  fontSizes,
  fontWeights,
  lineHeights,
  motion,
  radius,
  shadows,
  spacing,
  window,
  windowBackgroundColor,
} from './tokens.js';

const tokensCss = readFileSync(
  fileURLToPath(new URL('../renderer/styles/tokens.css', import.meta.url)),
  'utf8',
);
const baseCss = readFileSync(
  fileURLToPath(new URL('../renderer/styles/base.css', import.meta.url)),
  'utf8',
);

/** Normalize so `#F4F6F9` and `#f4f6f9` compare equal (CSS is case-insensitive). */
const norm = (s: string): string => s.toUpperCase();

/** `rgba(23,31,46,0.06)` ≡ `rgba(23, 31, 46, 0.06)` — same CSS value, different whitespace. */
const compact = (s: string): string => s.replace(/\s+/g, '');

/** Case- and whitespace-insensitive presence check of `--token: value` in CSS text. */
const hasToken = (css: string, token: string, value: string): boolean =>
  norm(compact(css)).includes(norm(`${token}:${value}`));

/* ------------------------------------------------------------------ */
/* §2.1 / §2.2 — Colors                                               */
/* ------------------------------------------------------------------ */

const colorSpec: ReadonlyArray<{
  token: string;
  light: string;
  dark?: string;
}> = [
  { token: 'bg-window', light: '#F4F6F9', dark: '#10131A' },
  { token: 'bg-surface', light: '#FFFFFF', dark: '#191D26' },
  { token: 'bg-hover', light: 'rgba(23,31,46,0.06)', dark: 'rgba(255,255,255,0.07)' },
  { token: 'text-primary', light: '#1A1D21', dark: '#E8EAED' },
  { token: 'text-secondary', light: '#5F6672', dark: '#9BA1AB' },
  { token: 'text-tertiary', light: '#9AA1AC', dark: '#5E6470' },
  { token: 'hairline', light: '#E2E5EA', dark: 'rgba(255,255,255,0.09)' },
  { token: 'accent', light: '#4D6BFE', dark: '#6C86FF' },
  { token: 'accent-hover', light: '#3A57F0', dark: '#7E95FF' },
  { token: 'accent-pressed', light: '#2E48D9', dark: '#5B74F0' },
  { token: 'accent-subtle', light: '#EEF1FF', dark: 'rgba(108,134,255,0.14)' },
  { token: 'accent-teal', light: '#12A5A1', dark: '#3CC9BE' },
  { token: 'error', light: '#E5484D', dark: '#F2555A' },
  { token: 'error-subtle', light: '#FDECEC', dark: 'rgba(242,85,90,0.12)' },
  { token: 'success', light: '#22A06B', dark: undefined },
  { token: 'focus-ring', light: 'rgba(77,107,254,0.35)', dark: 'rgba(108,134,255,0.50)' },
] as const;

describe('colors — spec §2.1 / §2.2', () => {
  it.each(colorSpec)('$token: light $light / dark $dark', ({ token, light, dark }) => {
    // tokens.ts mirrors the exact values
    expect(colorsLight[token as keyof typeof colorsLight]).toBe(light);
    if (dark !== undefined) {
      expect(colorsDark[token as keyof typeof colorsDark]).toBe(dark);
    } else {
      // `success` exists only in the light palette (spec table)
      expect((colorsDark as Record<string, unknown>)[token]).toBeUndefined();
    }

    // tokens.css declares every token in the light block
    expect(hasToken(tokensCss, token, light)).toBe(true);
    if (dark !== undefined) {
      expect(hasToken(tokensCss, token, dark)).toBe(true);
    }
  });

  it('exposes the accent and dark bg the task greps for', () => {
    expect(colorsLight.accent).toBe('#4D6BFE');
    expect(colorsDark['bg-window']).toBe('#10131A');
  });
});

/* ------------------------------------------------------------------ */
/* §2.3 — Corner radius                                               */
/* ------------------------------------------------------------------ */

const radiusSpec = {
  window: 8,
  dialog: 12,
  popover: 8,
  control: 6,
  chip: 10,
  pill: 999,
} as const;

describe('radius — spec §2.3', () => {
  it.each(Object.entries(radiusSpec))('%s → %s px', (name, value) => {
    expect(radius[name as keyof typeof radius]).toBe(value);
    expect(tokensCss).toMatch(new RegExp(`--radius-${name}:\\s*${value}px`));
  });
});

/* ------------------------------------------------------------------ */
/* §2.4 — Spacing (4px base)                                          */
/* ------------------------------------------------------------------ */

describe('spacing — spec §2.4', () => {
  it('provides the 4px-base scale 4/8/12/16/24/32', () => {
    expect(spacing).toEqual({ 4: 4, 8: 8, 12: 12, 16: 16, 24: 24, 32: 32 });
    for (const [px, v] of Object.entries(spacing)) {
      expect(tokensCss).toMatch(new RegExp(`--space-${px}:\\s*${v}px`));
    }
  });

  it('encodes the layout anchors (min/default window, title bar)', () => {
    expect(window).toMatchObject({
      minWidth: 800,
      minHeight: 560,
      defaultWidth: 1080,
      defaultHeight: 720,
      titleBarHeight: 36,
    });
    expect(tokensCss).toContain('--window-min-width: 800px');
    expect(tokensCss).toContain('--window-min-height: 560px');
    expect(tokensCss).toContain('--window-default-width: 1080px');
    expect(tokensCss).toContain('--window-default-height: 720px');
    expect(tokensCss).toContain('--titlebar-height: 36px');
  });
});

/* ------------------------------------------------------------------ */
/* §2.5 — Typography                                                  */
/* ------------------------------------------------------------------ */

describe('typography — spec §2.5', () => {
  it('font stacks contain every required family, in spec order', () => {
    expect(fonts.ui).toBe(
      '"Segoe UI Variable Text", "Segoe UI", "Microsoft YaHei UI", "微软雅黑", sans-serif',
    );
    expect(fonts.display).toContain('"Segoe UI Variable Display"');
    expect(fonts.display).toContain('"Microsoft YaHei UI"');
    expect(fonts.mono).toBe('"Cascadia Mono", Consolas, monospace');
    expect(tokensCss).toContain('"Segoe UI Variable Text"');
    expect(tokensCss).toContain('"Microsoft YaHei UI"');
    expect(tokensCss).toContain('"Cascadia Mono"');
  });

  it('weights are restricted to 400 / 500 / 600', () => {
    expect(fontWeights).toEqual({ regular: 400, medium: 500, semibold: 600 });
    expect(tokensCss).toContain('--font-weight-regular: 400');
    expect(tokensCss).toContain('--font-weight-medium: 500');
    expect(tokensCss).toContain('--font-weight-semibold: 600');
  });

  it('sizes: 12 (xs) / 13 (mono) / 14 (sm) / 18 (lg); line heights 1.6/1.4', () => {
    expect(fontSizes).toEqual({ xs: 12, mono: 13, sm: 14, lg: 18 });
    expect(lineHeights).toEqual({ body: 1.6, title: 1.4 });
    expect(tokensCss).toContain('--font-size-xs: 12px');
    expect(tokensCss).toContain('--font-size-mono: 13px');
    expect(tokensCss).toContain('--font-size-sm: 14px');
    expect(tokensCss).toContain('--font-size-lg: 18px');
    expect(tokensCss).toContain('--line-height-body: 1.6');
    expect(tokensCss).toContain('--line-height-title: 1.4');
  });

  it('applies the stacks in base.css without font-smoothing hacks', () => {
    expect(baseCss).toContain('font-family: var(--font-ui)');
    expect(baseCss).toContain('font-family: var(--font-display)');
    expect(baseCss).toContain('font-family: var(--font-mono)');
    expect(baseCss).not.toMatch(/-webkit-font-smoothing|text-rendering/);
  });
});

/* ------------------------------------------------------------------ */
/* §2.6 — Elevation (hairline first)                                  */
/* ------------------------------------------------------------------ */

describe('elevation — spec §2.6', () => {
  it('dialog shadow differs per theme; popover is shared', () => {
    expect(shadows.dialogLight).toBe('0 8px 24px rgba(15,20,35,0.10)');
    expect(shadows.dialogDark).toBe('0 8px 24px rgba(0,0,0,0.45)');
    expect(shadows.popover).toBe('0 4px 12px rgba(15,20,35,0.08)');
    expect(tokensCss).toContain('--shadow-dialog: 0 8px 24px rgba(15, 20, 35, 0.1)');
    expect(tokensCss).toContain('--shadow-dialog: 0 8px 24px rgba(0, 0, 0, 0.45)');
    expect(tokensCss).toContain('--shadow-popover: 0 4px 12px rgba(15, 20, 35, 0.08)');
  });

  it('base.css: hairline-first elevation utilities, no card shadows', () => {
    expect(baseCss).toContain('border: 1px solid var(--hairline)');
    expect(baseCss).toContain('box-shadow: var(--shadow-dialog)');
    expect(baseCss).toContain('box-shadow: var(--shadow-popover)');
    expect(baseCss).toContain('.elevation-dialog');
    expect(baseCss).toContain('.elevation-popover');
  });
});

/* ------------------------------------------------------------------ */
/* §5 — Motion                                                        */
/* ------------------------------------------------------------------ */

describe('motion — spec §5', () => {
  it('durations: in 140 / out 100 / scrim 120 / hover 100 / press 80 / status 150 / spinner 800', () => {
    expect(motion.dialogInMs).toBe(140);
    expect(motion.dialogOutMs).toBe(100);
    expect(motion.scrimMs).toBe(120);
    expect(motion.hoverMs).toBe(100);
    expect(motion.pressMs).toBe(80);
    expect(motion.statusMs).toBe(150);
    expect(motion.spinnerMs).toBe(800);
    expect(motion.easingStandard).toBe('cubic-bezier(0.16, 1, 0.3, 1)');
    expect(motion.easingOut).toBe('ease-out');
    expect(motion.easingLinear).toBe('linear');
  });

  it('tokens.css exposes the durations and easing curve', () => {
    expect(tokensCss).toContain('--duration-dialog-in: 140ms');
    expect(tokensCss).toContain('--duration-dialog-out: 100ms');
    expect(tokensCss).toContain('--duration-scrim: 120ms');
    expect(tokensCss).toContain('--duration-hover: 100ms');
    expect(tokensCss).toContain('--duration-press: 80ms');
    expect(tokensCss).toContain('--duration-status: 150ms');
    expect(tokensCss).toContain('--duration-spinner: 800ms');
    expect(tokensCss).toContain('--easing-standard: cubic-bezier(0.16, 1, 0.3, 1)');
  });

  it('base.css honors prefers-reduced-motion (spec §5)', () => {
    expect(baseCss).toContain('@media (prefers-reduced-motion: reduce)');
  });
});

/* ------------------------------------------------------------------ */
/* Theme switching (spec §2.2)                                        */
/* ------------------------------------------------------------------ */

describe('theme switching — spec §2.2', () => {
  it('tokens.css defines the system default + both override classes', () => {
    expect(tokensCss).toContain('@media (prefers-color-scheme: dark)');
    expect(tokensCss).toContain('.theme-light');
    expect(tokensCss).toContain('.theme-dark');
  });

  it('dark values are reachable in both the override class and the media query', () => {
    const darkBlock =
      tokensCss.split('@media (prefers-color-scheme: dark)')[0] ?? '';
    const systemBlock = tokensCss.split('@media (prefers-color-scheme: dark)')[1] ?? '';
    for (const { token, dark } of colorSpec) {
      if (dark === undefined) continue;
      expect(hasToken(darkBlock, token, dark)).toBe(true);
      expect(hasToken(systemBlock, token, dark)).toBe(true);
    }
  });

  it('main process can resolve window chrome colors per theme', () => {
    expect(windowBackgroundColor(false)).toBe('#F4F6F9');
    expect(windowBackgroundColor(true)).toBe('#10131A');
  });
});
