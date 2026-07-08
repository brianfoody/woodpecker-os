/** @type {import('next').NextConfig} */
const nextConfig = {
  // The protocol package ships TypeScript source; Next compiles it in-place.
  transpilePackages: ["@woodpeckeros/protocol"],
};

module.exports = nextConfig;
