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
                canvas: '#f6f7f9',
                track: '#e4eaf1',
                accent: '#0f766e',
                hairline: '#e3e7ec',
                line: '#e3e7ec',
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
                card: '10px',
            },
            boxShadow: {
                card: 'none',
                tile: 'none',
                thumb: '0 1px 3px rgba(0, 0, 0, 0.12), 0 1px 1px rgba(0, 0, 0, 0.04)',
                float: '0 10px 40px rgba(0, 0, 0, 0.14), 0 2px 6px rgba(0, 0, 0, 0.06)',
            },
        },
    },
    plugins: [],
};
