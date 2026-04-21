/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{html,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        dock: '#1F1F1F',
        accent: '#4CC2FF'
      }
    }
  },
  plugins: []
};
