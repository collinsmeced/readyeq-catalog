import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Matched from readyeq.com
        brand: {
          blue: '#1d5fa0',      // CTA button blue
          navy: '#0F1827',      // dark backgrounds / footer
          dark: '#1a1a1a',      // headings
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        condensed: ['Impact', 'Arial Narrow', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
