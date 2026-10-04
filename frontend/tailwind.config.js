/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        denon: {
          // Accent color — driven by CSS var, set at runtime from theme
          gold:    'var(--accent)',
          accent:  'var(--accent)',
          // Fixed dark palette
          dark:    '#0D0D0D',
          card:    '#1A1A1A',
          surface: '#242424',
          border:  '#333333',
          text:    '#E5E5E5',
          muted:   '#888888',
          green:   '#4ADE80',
          red:     '#EF4444',
          blue:    '#60A5FA',
        },
      },
    },
  },
  plugins: [],
}
