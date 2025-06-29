/** @type {import('next').NextConfig} */
const nextConfig = {
  // Removed static export configuration to keep tldraw working
  eslint: {
    ignoreDuringBuilds: true,
  },
  serverExternalPackages: ['@tldraw/editor', '@tldraw/tldraw', 'tldraw'],
  // Environment variables for client-side usage
  env: {
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
    TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER,
  },
};

module.exports = nextConfig;