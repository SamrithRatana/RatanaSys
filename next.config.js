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
  staticPageGenerationTimeout: 120,

  // ── Serve /.well-known/assetlinks.json with correct Content-Type ──────────
  // This tells Android that system.camprotec.com.kh has an installed PWA,
  // so Chrome will auto-launch the PWA instead of staying in browser mode.
  async headers() {
    return [
      {
        source: "/.well-known/assetlinks.json",
        headers: [
          { key: "Content-Type",                   value: "application/json" },
          { key: "Access-Control-Allow-Origin",     value: "*"               },
          { key: "Cache-Control",                   value: "public, max-age=3600" },
        ],
      },
    ];
  },
}

module.exports = nextConfig