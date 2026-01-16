/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{vue,js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["\"Space Grotesk\"", "sans-serif"],
        body: ["\"Work Sans\"", "sans-serif"],
      },
      colors: {
        ink: "#121212",
        paper: "#f7f3ee",
        line: "#e7e0d6",
        accent: "#e2b714",
        accentDeep: "#c18f00",
        mint: "#30c6a4",
        coral: "#ee6f4c",
      },
      boxShadow: {
        card: "0 16px 40px rgba(18, 18, 18, 0.12)",
        glow: "0 12px 24px rgba(226, 183, 20, 0.25)",
      },
    },
  },
  plugins: [],
};
