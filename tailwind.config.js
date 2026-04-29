/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{html,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        dock: '#323232',
        accent: '#4CC2FF',
        // 保留 amber 定义以兼容旧引用
        amber: {
          DEFAULT: '#4CC2FF',
          hover: '#3DB8F0',
          soft: 'rgba(76,194,255,0.12)',
          line: 'rgba(76,194,255,0.55)'
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
