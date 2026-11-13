/** @type {import('tailwindcss').Config} */
// Baren tema A "Neon": colours are named by role. Components use these tokens
// directly (bg-surface, text-secondary, ...). Values live in src/styles/theme.css.
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--color-background)",
        surface: "var(--color-surface)",
        raised: "var(--color-raised)",
        hairline: {
          DEFAULT: "var(--color-hairline)",
          strong: "var(--color-hairline-strong)",
        },
        text: "var(--color-text)",
        secondary: "var(--color-secondary)",
        tertiary: "var(--color-tertiary)",
        accent: {
          DEFAULT: "var(--color-accent)",
          on: "var(--color-on-accent)",
        },
        diamonds: "var(--color-diamonds)",
        success: "var(--color-success)",
        danger: "var(--color-danger)",
        rarity: {
          common: "var(--color-rarity-common)",
          rare: "var(--color-rarity-rare)",
          epic: "var(--color-rarity-epic)",
          legendary: "var(--color-rarity-legendary)",
          special: "var(--color-rarity-special)",
        },
      },
      fontFamily: {
        sign: ["Pacifico", "cursive"],
        display: ["Fraunces", "Georgia", "serif"],
        sans: ['"DM Sans"', "system-ui", "sans-serif"],
      },
      borderRadius: {
        sm: "8px",
        md: "12px",
        lg: "16px",
        xl: "16px",
        "2xl": "20px",
      },
    },
  },
  plugins: [],
}
