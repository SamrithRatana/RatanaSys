import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'LMS App',
    short_name: 'LMS App',
    description: 'LMS by Camprotec',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#0088cc',
    icons: [
      {
        src: '/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',   // ✅ just 'maskable', not 'any maskable'
      },
      {
        src: '/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',   // ✅ just 'maskable', not 'any maskable'
      },
      // Add a separate entry for 'any' purpose (optional but recommended)
      {
        src: '/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  }
}