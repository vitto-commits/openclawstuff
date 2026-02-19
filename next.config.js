/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3'],
  },
  // Ensure NEXT_PUBLIC_API_URL is available in the browser
  publicRuntimeConfig: {
    apiUrl: process.env.NEXT_PUBLIC_API_URL || '',
  },
  // Also ensure env vars are passed through
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || '',
  },
};
module.exports = nextConfig;
