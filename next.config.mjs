/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 is a native addon; keep it out of the bundler.
  webpack: (config) => {
    config.externals = [...(config.externals || []), 'better-sqlite3'];
    return config;
  },
};

export default nextConfig;
