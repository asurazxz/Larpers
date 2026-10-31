/** @type {import('tailwindcss').Config} */

// Apple-like neutrals and one accent. The gray/slate/blue/sky scales are remapped so every existing
// utility lands on the same restrained palette; text-gray-500 and up stay AA-legible on white.
const neutral = {
    50: '#fbfbfd',
    100: '#f5f5f7',
    200: '#e8e8ed',
    300: '#d2d2d7',
    400: '#aeaeb2',
    500: '#6e6e73',
    600: '#6e6e73',
    700: '#515154',
    800: '#3a3a3c',
    900: '#1d1d1f',
};
const accent = {
    50: '#f2f7fe',
    100: '#e6f0fc',
    200: '#cce1fa',
    300: '#99c3f4',
    400: '#4d97ec',
    500: '#0077ed',
    600: '#0071e3',
    700: '#0071e3',
    800: '#0062c4',
    900: '#004d99',
};

module.exports = {
    content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
    theme: {
        extend: {
            colors: {
                gray: neutral,
                slate: neutral,
                blue: accent,
                sky: accent,
                ink: '#0b1f33',
                ink2: '#56677b',
                ink3: '#34475b',
                canvas: '#eef2f6',
                track: '#e4eaf1',
                accent: '#0f766e',
                hairline: 'rgba(11, 31, 51, 0.09)',
                brand: {
                    ink: '#0b1f33',
                    navy: '#0f2a3d',
                    deep: '#071521',
                    teal: '#14b8a6',
                    emerald: '#10b981',
                    mint: '#ccfbf1',
                    warm: '#f59e0b',
                    sand: '#fff7e6',
                },
                leg1: '#2f9e4f',
                leg2: '#e5a00d',
                leg3: '#0ea5c6',
                robust: '#0071e3',
                fragile: '#e8710a',
                navy: '#102A43',
                primary: '#2563EB',
                deep: '#0F172A',
                muted: '#64748B',
                app: '#F8FAFC',
                line: '#E2E8F0',
                success: '#15803D',
                warning: '#B45309',
                danger: '#B91C1C',
            },
            fontFamily: {
                sans: [
                    '-apple-system',
                    'BlinkMacSystemFont',
                    '"SF Pro Text"',
                    '"SF Pro Display"',
                    '"Segoe UI Variable"',
                    '"Segoe UI"',
                    'Inter',
                    'system-ui',
                    'sans-serif',
                ],
            },
            borderRadius: {
                card: '16px',
            },
            boxShadow: {
                card: '0 1px 2px rgba(11, 31, 51, 0.06)',
                tile: '0 1px 2px rgba(11, 31, 51, 0.06)',
                thumb: '0 1px 2px rgba(0, 0, 0, 0.12)',
                float: '0 8px 24px rgba(0, 0, 0, 0.14)',
            },
        },
    },
    plugins: [],
};
