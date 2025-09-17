// workbox-config.js
module.exports = {
  globDirectory: "dist/",

  // No precache — runtime caching only
  globPatterns: [],

  runtimeCaching: [
    // 1. SPA Navigations - Network first
    {
      urlPattern: ({ request }) => request.mode === "navigate",
      handler: "NetworkFirst",
      options: {
        cacheName: "navigation-cache",
        networkTimeoutSeconds: 3,
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 24 * 60 * 60, // 1 day
        },
        cacheableResponse: { statuses: [0, 200] },
      },
    },

    // 2. HTML files - Network first
    {
      urlPattern: /\.html$/i,
      handler: "NetworkFirst",
      options: {
        cacheName: "html-cache",
        networkTimeoutSeconds: 2,
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 12 * 60 * 60, // 12 hours
        },
        cacheableResponse: { statuses: [0, 200] },
      },
    },

    // 3. JS & CSS - StaleWhileRevalidate
    {
      urlPattern: /\.(?:js|css)$/i,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "static-resources",
        expiration: {
          maxEntries: 60,
          maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
          purgeOnQuotaError: true,
        },
        cacheableResponse: { statuses: [0, 200] },
      },
    },

    // 4. Images - CacheFirst
    {
      urlPattern: /\.(?:png|jpg|jpeg|gif|webp|svg|ico)$/i,
      handler: "CacheFirst",
      options: {
        cacheName: "image-cache",
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
          purgeOnQuotaError: true,
        },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
  ],

  // Output Service Worker
  swDest: "dist/sw.js",

  // Build options
  sourcemap: false,
  mode: "production",

  // SW lifecycle
  skipWaiting: true,
  clientsClaim: true,
  cleanupOutdatedCaches: true,

  // No precache fallback
  navigateFallback: null,

  // Ignore UTM and fbclid params
  ignoreURLParametersMatching: [/^utm_/, /^fbclid$/],

  // Max cache size per file (15MB)
  maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
};
