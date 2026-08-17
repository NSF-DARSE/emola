import type { Config } from 'tailwindcss';

/**
 * Every colour resolves to a CSS custom property defined in globals.css, so a
 * component written against these tokens themes correctly in both light and
 * dark with no per-component branching.
 */
const config: Config = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        elevated: 'var(--elevated)',
        fg: 'var(--fg)',
        muted: 'var(--muted)',
        faint: 'var(--faint)',
        border: 'var(--border)',
        'border-strong': 'var(--border-strong)',
        hover: 'var(--hover)',
        selected: 'var(--selected)',
        signal: {
          red: 'var(--sig-red)',
          amber: 'var(--sig-amber)',
          green: 'var(--sig-green)',
          blue: 'var(--sig-blue)',
        },
        'signal-bg': {
          red: 'var(--sig-red-bg)',
          amber: 'var(--sig-amber-bg)',
          green: 'var(--sig-green-bg)',
          blue: 'var(--sig-blue-bg)',
        },
      },
      fontFamily: {
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Inter',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'SF Mono',
          'Cascadia Mono',
          'Menlo',
          'Consolas',
          'monospace',
        ],
      },
      borderColor: {
        DEFAULT: 'var(--border)',
      },
    },
  },
  plugins: [],
};

export default config;
