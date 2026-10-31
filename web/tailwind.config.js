/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
    theme: {
        extend: {
            colors: {
                leg1: '#2e9e44',
                leg2: '#e0a100',
                leg3: '#0aa5c2',
                robust: '#1f6fd1',
                fragile: '#e8710a',
            },
        },
    },
    plugins: [],
};
