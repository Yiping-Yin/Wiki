import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx,md,mdx}', './components/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
