import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const day = 24 * 60 * 60;

export default {
  // Vite owns dist/; Workbox adds the runtime-only service worker after that build.
  globDirectory: path.join(root, 'dist'),
  globPatterns: [],
  runtimeCaching: [
    {
      urlPattern: ({ request }) => request.mode === 'navigate',
      handler: 'NetworkFirst',
      options: {
        cacheName: 'navigation-cache',
        networkTimeoutSeconds: 3,
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: day,
        },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    {
      urlPattern: /\.html$/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'html-cache',
        networkTimeoutSeconds: 2,
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 12 * 60 * 60,
        },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    {
      urlPattern: /\.(?:js|css)$/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'static-resources',
        expiration: {
          maxEntries: 60,
          maxAgeSeconds: 7 * day,
          purgeOnQuotaError: true,
        },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    {
      urlPattern: /\.(?:png|jpg|jpeg|gif|webp|svg|ico)$/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'image-cache',
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 30 * day,
          purgeOnQuotaError: true,
        },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
  ],
  swDest: path.join(root, 'dist', 'sw.js'),
  sourcemap: false,
  skipWaiting: true,
  clientsClaim: true,
  cleanupOutdatedCaches: true,
  // No precache or navigation fallback: keep the legacy runtime-only strategy.
  ignoreURLParametersMatching: [/^utm_/, /^fbclid$/],
  maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
};
