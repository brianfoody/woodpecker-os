/** @type {import('next').NextConfig} */
const nextConfig = {
  compress: false, // Prevents compression buffering on SSE streams
  serverExternalPackages: ["better-sqlite3"],
};

module.exports = nextConfig;
