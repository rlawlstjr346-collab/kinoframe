import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        darkroom: {
          base: "#09090B",
          mount: "#111216",
          hover: "#171920",
          recessed: "#0D0E12",
        },
        ivory: "#F4F1EA",
        silver: "#BEB9AE",
        amber: {
          kodak: "#D99B26",
          glow: "#E6B042",
          dim: "rgba(217, 155, 38, 0.16)",
        },
      },
      fontFamily: {
        sans: [
          "Pretendard Variable",
          "Pretendard",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Apple SD Gothic Neo"',
          '"Noto Sans KR"',
          '"Segoe UI"',
          "sans-serif",
        ],
        mono: [
          '"JetBrains Mono"',
          '"SFMono-Regular"',
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
      borderColor: {
        rim: "rgba(244, 241, 234, 0.09)",
        "rim-strong": "rgba(244, 241, 234, 0.18)",
      },
      boxShadow: {
        mount:
          "0 1px 0 0 rgba(244, 241, 234, 0.08) inset, 0 18px 42px -18px rgba(0, 0, 0, 0.85)",
        "mount-hover":
          "0 1px 0 0 rgba(217, 155, 38, 0.35) inset, 0 24px 54px -16px rgba(0, 0, 0, 0.95)",
      },
    },
  },
  plugins: [],
};

export default config;
