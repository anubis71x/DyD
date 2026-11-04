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
  experimental: {
    // Load the Anthropic SDK from node_modules instead of bundling it: the
    // Next 14.1 minifier mangles one of its regular expressions.
    serverComponentsExternalPackages: ["@anthropic-ai/sdk"],
  },
};

export default nextConfig;