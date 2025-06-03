import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class', // or 'media' if you prefer
  theme: {
    extend: {
      colors: {
        'dark-bg': '#0D0D0D',
        'dark-card': '#1A1A1A',
        'neon-pink': '#F50057',
        'neon-green': '#00FF7F',
        'neon-blue': '#00E5FF',
        'light-text': '#E0E0E0',
        'medium-text': '#A0A0A0',
      },
    },
  },
  plugins: [],
}
export default config
