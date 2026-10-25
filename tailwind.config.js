/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#F7F8FB',
        primary: {
          DEFAULT: '#4F46E5',
          hover: '#4338CA',
          soft: '#EEF2FF',
        },
        // 暗色模式覆盖在 dark: 变体中处理，这里保留语义别名
        ink: {
          DEFAULT: '#111827',
          secondary: '#6B7280',
          muted: '#9CA3AF',
        },
        line: {
          DEFAULT: '#E5E7EB',
          split: '#F3F4F6',
        },
      },
      fontSize: {
        h1: ['24px', '1.3'],
        h2: ['20px', '1.3'],
        h3: ['16px', '1.3'],
        body: ['14px', '1.6'],
        assist: ['12px', '1.6'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(17,24,39,0.04), 0 2px 8px rgba(79,70,229,0.05)',
        'card-hover': '0 8px 24px rgba(79,70,229,0.12), 0 2px 6px rgba(17,24,39,0.06)',
        modal: '0 24px 64px rgba(17,24,39,0.22)',
        glow: '0 0 0 4px rgba(99,102,241,0.12)',
      },
      borderRadius: {
        btn: '10px',
        card: '16px',
        modal: '20px',
        tag: '8px',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', '"PingFang SC"', '"Microsoft YaHei"', 'sans-serif'],
      },
      keyframes: {
        'pop-in': {
          from: { opacity: '0', transform: 'translateY(6px) scale(0.985)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'modal-in': {
          from: { opacity: '0', transform: 'scale(0.98)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'toast-in': {
          from: { opacity: '0', transform: 'translateY(-8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'pop-in': 'pop-in 180ms cubic-bezier(0.16,1,0.3,1)',
        'fade-in': 'fade-in 150ms ease-out',
        'modal-in': 'modal-in 100ms ease-out',
        'toast-in': 'toast-in 150ms ease-out',
      },
    },
  },
  plugins: [],
};
