/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,  // 🔄 Activa el modo estricto para detectar problemas
  swcMinify: true,        // 🔄 Activa la minificación con SWC
  images: {
    remotePatterns: [
      {
        hostname: "res.cloudinary.com",
      },
      {
        hostname: "images.ctfassets.net",
      },
      {
        hostname: "drive.google.com",
      },
      {
        hostname: "i.ibb.co"
      }
    ],
  },
  async rewrites() {  // 🔄 Agrega esto para que las rutas API funcionen
    return [
      {
        source: '/api/vapi/:path*',
        destination: '/api/vapi/:path*',
      },
    ];
  },
};

export default nextConfig;