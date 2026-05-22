/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    serverActions: {
      allowedOrigins: [
        "system.camprotec.com.kh",
        "localhost:3000",
      ],
    },
  },
  // ✅ Add this line to fix DYNAMIC_SERVER_USAGE build error
  staticPageGenerationTimeout: 120,
}

module.exports = nextConfig