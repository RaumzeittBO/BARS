/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bars: {
          bg: '#0B0B0B',
          panel: '#141414',
          panelElevated: '#1C1C1E',
          card: '#18181A',
          border: '#262626',
          borderLight: '#333333',
          orange: '#FF6A00',
          orangeHover: '#E55F00',
          orangeSoft: 'rgba(255, 106, 0, 0.15)',
          orangeWash: 'rgba(255, 106, 0, 0.08)',
          text: '#FFFFFF',
          muted: '#9E9E9E',
          subtle: '#666666',
        },
        // Semantic overrides mapped to BARS theme
        canvas: '#0B0B0B',
        panel: '#141414',
        ink: '#FFFFFF',
        muted: '#9E9E9E',
        line: '#262626',
        lineStrong: '#333333',
        accent: '#FF6A00',
        accentStrong: '#E55F00',
        accentSoft: '#2E1809',
        accentWash: '#1C1109',
        success: '#10B981',
        successSoft: '#064E3B',
        warning: '#F59E0B',
        warningSoft: '#451A03',
      },
      boxShadow: {
        float: '0 24px 70px -34px rgba(0, 0, 0, 0.8)',
        card: '0 8px 30px rgba(0, 0, 0, 0.5)',
        insetSoft: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        glow: '0 0 20px rgba(255, 106, 0, 0.25)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

