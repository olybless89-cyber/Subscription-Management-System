import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        wo: {
          black: '#040a08',
          dark: '#060f0d',
          panel: '#0a1613',
          border: '#16281f',
          green: '#2af598',
          greenDark: '#0f9e63',
          white: '#ffffff',
          light: '#f6f9f8',
          text: '#0a1512',
          muted: '#8aa39a',
          mutedDark: '#5b756c',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      boxShadow: {
        glow: '0 0 40px rgba(42, 245, 152, 0.25)',
        card: '0 1px 0 rgba(255,255,255,0.03) inset, 0 8px 24px rgba(0,0,0,0.35)',
      },
      backgroundImage: {
        'radial-fade': 'radial-gradient(circle at 50% 50%, rgba(42,245,152,0.18), transparent 60%)',
      },
      keyframes: {
        'pulse-dot': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        'spin-slow': {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        'pulse-dot': 'pulse-dot 2s ease-in-out infinite',
        float: 'float 6s ease-in-out infinite',
        'spin-slow': 'spin-slow 60s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
