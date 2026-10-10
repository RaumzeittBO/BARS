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
        // Superficies de trabajo claras; la navegación conserva el tema oscuro.
        canvas: '#FFF9F4',
        panel: '#F4EEE8',
        ink: '#201C19',
        muted: '#62564E',
        line: '#E6DCD2',
        lineStrong: '#CCBDB0',
        accent: '#FF6A00',
        accentStrong: '#E55F00',
        accentSoft: '#FFE9D8',
        accentWash: '#FFF2E7',
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

