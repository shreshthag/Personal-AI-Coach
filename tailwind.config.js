/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App.tsx", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  darkMode: "media",
  theme: {
    extend: {
      colors: {
        ink: "#17201C",
        leaf: "#1E6B57",
        mint: "#DDECE5",
        clay: "#D56A3A",
        oat: "#F8FAF7"
      }
    }
  },
  plugins: []
};
