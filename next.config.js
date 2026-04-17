/** @type {import('next').NextConfig} */
const nextConfig = {
  compress: false, // Prevents compression buffering on SSE streams
  serverExternalPackages: ["better-sqlite3", "@anthropic-ai/claude-agent-sdk"],
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: /\.db(-shm|-wal)?$/,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
