/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        denon: {
          // Accent — driven by CSS var, set at runtime from theme
          gold:    'var(--accent)',
          accent:  'var(--accent)',
          // Structural palette — driven by CSS vars, overridable per theme
          dark:    'var(--bg)',
          card:    'var(--card)',
          surface: 'var(--surface)',
          border:  'var(--border)',
          text:    'var(--text)',
          muted:   'var(--muted)',
          // Status colors — fixed, not user-overridable
          green:   '#4ADE80',
          red:     '#EF4444',
          blue:    '#60A5FA',
        },
      },
    },
  },
  plugins: [],
}
