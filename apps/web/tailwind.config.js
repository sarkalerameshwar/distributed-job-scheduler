/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "rgb(var(--color-canvas) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        paper: "rgb(var(--color-paper) / <alpha-value>)",
        ink: "rgb(var(--color-ink) / <alpha-value>)",
        steel: "rgb(var(--color-steel) / <alpha-value>)",
        line: "rgb(var(--color-line) / <alpha-value>)",
        pine: {
          DEFAULT: "rgb(var(--color-pine) / <alpha-value>)",
          deep: "rgb(var(--color-pine-deep) / <alpha-value>)",
          soft: "rgb(var(--color-pine-soft) / <alpha-value>)",
          mist: "rgb(var(--color-pine-mist) / <alpha-value>)",
        },
        signal: {
          ok: "rgb(var(--color-signal-ok) / <alpha-value>)",
          warn: "rgb(var(--color-signal-warn) / <alpha-value>)",
          danger: "rgb(var(--color-signal-danger) / <alpha-value>)",
        },
      },
      fontFamily: {
        display: ["Manrope", "system-ui", "sans-serif"],
        sans: ["Manrope", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "var(--shadow-card)",
        lift: "var(--shadow-lift)",
      },
      keyframes: {
        rise: {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        pulseDot: {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.45", transform: "scale(0.85)" },
        },
      },
      animation: {
        rise: "rise 0.4s cubic-bezier(0.22, 1, 0.36, 1) both",
        "pulse-dot": "pulseDot 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
