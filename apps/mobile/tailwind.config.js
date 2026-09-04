/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#FF6B1A',
        'primary-dark': '#E55A0E',
        'primary-light': '#FF8C4A',
        secondary: '#1A73E8',
        success: '#34A853',
        warning: '#FBBC04',
        error: '#EA4335',
      },
    },
  },
  plugins: [],
};
