/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f4f6fc',
          100: '#e8ecf9',
          200: '#cbd4f3',
          300: '#a3b3ea',
          400: '#738ade',
          500: '#4e62d0',
          600: '#3946b8',
          700: '#2f379a',
          800: '#2a3080',
          900: '#272d69',
          950: '#181b3f',
        },
        dark: {
          50: '#f6f6f7',
          100: '#e1e2e5',
          200: '#c2c5cb',
          300: '#9ba0ab',
          400: '#717886',
          500: '#555b69',
          600: '#434855',
          700: '#383c47',
          800: '#2b2e36',
          900: '#1b1d22',
          950: '#101115',
        }
      },
      fontFamily: {
        sans: ['Outfit', 'Inter', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
