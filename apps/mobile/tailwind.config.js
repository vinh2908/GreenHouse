/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: '#4ADE80',
        'primary-dark': '#22C55E',
        'primary-light': '#86EFAC',
        secondary: '#1A73E8',
        success: '#22C55E',
        warning: '#FBBC04',
        error: '#EA4335',
      },
    },
  },
  plugins: [],
};
