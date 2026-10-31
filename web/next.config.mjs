/** @type {import('next').NextConfig} */
const nextConfig = {
    // Static export: no Next server, so it runs from Vercel, localhost or file://.
    output: 'export',
    // Relative asset paths are required for file://; absolute /_next paths render nothing there.
    // Keep the app to one route: the relative prefix only holds at the root.
    // Production builds only: `next dev` does not hydrate with a relative prefix.
    assetPrefix: process.env.NODE_ENV === 'production' ? './' : undefined,
    images: { unoptimized: true },
    trailingSlash: true,
};

export default nextConfig;
