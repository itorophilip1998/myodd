/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0f1a14',
        moss: '#1d3a2a',
        leaf: '#2f6b4f',
        lime: '#b7e27c',
        sand: '#e8e2d4',
        mist: '#f3efe6',
        ember: '#c45c26',
      },
      fontFamily: {
        display: ['"Fraunces"', 'Georgia', 'serif'],
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        pitch:
          'radial-gradient(ellipse at 20% 10%, rgba(183,226,124,0.25), transparent 50%), radial-gradient(ellipse at 80% 0%, rgba(47,107,79,0.35), transparent 45%), linear-gradient(160deg, #0f1a14 0%, #1d3a2a 45%, #122018 100%)',
      },
      keyframes: {
        rise: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '0.55' },
          '50%': { opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
      },
      animation: {
        rise: 'rise 0.7s ease-out both',
        'rise-delay': 'rise 0.7s ease-out 0.15s both',
        'rise-late': 'rise 0.7s ease-out 0.3s both',
        pulseSoft: 'pulseSoft 2.4s ease-in-out infinite',
        shimmer: 'shimmer 2.5s linear infinite',
      },
    },
  },
  plugins: [],
};
