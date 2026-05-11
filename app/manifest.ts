import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'CAM Leave Management System',
    short_name: 'CAM LMS',
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
      },
      {
        src: '/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}