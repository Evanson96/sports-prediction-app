export default {
  content: ['./client/index.html', './client/src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: '#10201b',
        pitch: '#0f6b45',
        lime: '#c5f24b',
        sun: '#f7b538',
        clay: '#b6532f',
        cloud: '#f6f7f2',
      },
    },
  },
  plugins: [],
};
