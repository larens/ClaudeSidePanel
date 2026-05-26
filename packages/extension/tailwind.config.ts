import type { Config } from "tailwindcss";

export default {
  content: ["src/**/*.{ts,tsx,html}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        claude: {
          bg: "var(--color-bg)",
          surface: "var(--color-surface)",
          border: "var(--color-border)",
          text: "var(--color-text)",
          muted: "var(--color-muted)",
          accent: "var(--color-accent)",
          "accent-hover": "var(--color-accent-hover)",
          success: "var(--color-success)",
          error: "var(--color-error)",
          warning: "var(--color-warning)",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      fontSize: {
        xs: ["0.6875rem", { lineHeight: "1rem" }],
      },
      animation: {
        "fade-in": "fadeIn 0.2s ease-out",
        "slide-up": "slideUp 0.2s ease-out",
        pulse: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
