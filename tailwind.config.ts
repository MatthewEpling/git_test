import type { Config } from "tailwindcss";

// Colors are CSS variables so the light/dark toggle swaps the whole palette.
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: v("bg"),
        panel: v("panel"),
        panel2: v("panel2"),
        line: v("line"),
        ink: v("ink"),
        muted: v("muted"),
        gold: v("gold"),
        good: v("good"),
        bad: v("bad"),
        warn: v("warn"),
        sea: v("sea"),
      },
      fontFamily: {
        display: ['"Cinzel"', "Georgia", "serif"],
        body: ['"Inter"', "system-ui", "sans-serif"],
        pixel: ['"Pixelify Sans"', "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
