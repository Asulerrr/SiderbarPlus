/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{html,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        dock: '#1F1F1F',
        accent: '#4CC2FF',
        // editorial accent — 暖橘，配置流（add-site / settings）的高亮色
        amber: {
          DEFAULT: '#E8835D',
          hover: '#D97757',
          soft: 'rgba(232,131,93,0.12)',
          line: 'rgba(232,131,93,0.55)'
        }
      },
      fontFamily: {
        display: [
          'Segoe UI Variable Display',
          'Segoe UI Variable',
          'Segoe UI',
          'system-ui',
          'sans-serif'
        ],
        body: [
          'Segoe UI Variable Text',
          'Segoe UI Variable',
          'Segoe UI',
          'system-ui',
          'sans-serif'
        ],
        mono: [
          'Cascadia Code',
          'JetBrains Mono',
          'Consolas',
          'ui-monospace',
          'monospace'
        ]
      },
      letterSpacing: {
        cn: '0.06em' // 中文 label 用：替代 uppercase tracking
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' }
        }
      },
      animation: {
        'fade-up': 'fade-up 280ms cubic-bezier(0.2, 0, 0, 1) both'
      }
    }
  },
  plugins: []
};
