/** @type {import('next').NextConfig} */
const nextConfig = {
  // Autorise le serveur de DEV depuis le réseau local (test mobile).
  // Sans effet en production. Adapter l'IP si elle change.
  allowedDevOrigins: ["192.168.1.138"],
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
