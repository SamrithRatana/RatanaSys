/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',

  outputFileTracingExcludes: {
    '*': [
      './node_modules/@swc/core-linux-x64-gnu',
      './node_modules/@swc/core-linux-x64-musl',
      './node_modules/sharp',
      './node_modules/@img',
      './node_modules/esbuild',
      './node_modules/webpack',
    ],
  },

  experimental: {
    // Load these with Node's require instead of bundling them — exceljs's
    // stream polyfills break when webpack bundles them (export route crashes)
    serverComponentsExternalPackages: ["exceljs", "pdfkit"],
    workerThreads: false,
    cpus: 1,
    serverActions: {
      allowedOrigins: [
        "system.camprotec.com.kh",
        "localhost:3000",
      ],
    },
  },

  staticPageGenerationTimeout: 300,
}

module.exports = nextConfig