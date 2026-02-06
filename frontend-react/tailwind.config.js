/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                // Cyberpunk color palette
                cyber: {
                    cyan: '#00FFFF',
                    purple: '#8B5CF6',
                    pink: '#FF00FF',
                    dark: '#0a0a0f',
                    darker: '#050508',
                    card: '#111118',
                    border: '#1f1f2e',
                    text: '#e4e4e7',
                    muted: '#71717a',
                },
            },
            fontFamily: {
                sans: ['Inter', 'system-ui', 'sans-serif'],
                mono: ['JetBrains Mono', 'monospace'],
            },
            boxShadow: {
                'cyber': '0 0 20px rgba(0, 255, 255, 0.3)',
                'cyber-lg': '0 0 40px rgba(0, 255, 255, 0.4)',
                'cyber-purple': '0 0 20px rgba(139, 92, 246, 0.3)',
            },
            animation: {
                'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                'glow': 'glow 2s ease-in-out infinite alternate',
            },
            keyframes: {
                glow: {
                    '0%': { boxShadow: '0 0 5px rgba(0, 255, 255, 0.5)' },
                    '100%': { boxShadow: '0 0 20px rgba(0, 255, 255, 0.8)' },
                },
            },
        },
    },
    plugins: [],
}
