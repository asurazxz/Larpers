import type { Metadata } from 'next';
import 'leaflet/dist/leaflet.css';
import './globals.css';

export const metadata: Metadata = {
    title: 'Kalimantan SAF Network Planner',
    description: 'Larpers, Airbus Challenge #3: a solved SAF supply-chain network on the official 80 Kalimantan sites.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}
