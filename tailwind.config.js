import forms from '@tailwindcss/forms';
import typography from '@tailwindcss/typography';
import containerQueries from '@tailwindcss/container-queries';

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './App.tsx',
    './index.tsx',
    './components/**/*.{ts,tsx}',
    './pages/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    './utils/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#135bec',
        'primary-hover': '#1d4ed8',
        'background-light': '#f6f6f8',
        'background-dark': '#101622',
      },
      fontFamily: {
        sans: ['Public Sans', 'sans-serif'],
        display: ['Public Sans', 'sans-serif'],
      },
    },
  },
  safelist: [
    {
      pattern: /(bg|text|border|ring)-(slate|gray|red|orange|amber|yellow|green|emerald|blue|indigo|purple|pink)-(50|100|200|300|400|500|600|700|800|900)/,
      variants: ['hover', 'dark', 'group-hover'],
    },
  ],
  plugins: [
    forms,
    typography,
    containerQueries,
  ],
};
