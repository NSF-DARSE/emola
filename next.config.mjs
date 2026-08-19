/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emits .next/standalone for container hosts. Vercel ignores it and builds
  // its own bundle, so leaving it on costs nothing and keeps Docker working.
  output: 'standalone',

  experimental: {
    /*
     * Files read at runtime with fs, rather than imported.
     *
     * Next decides what to ship by following imports. Anything opened with
     * fs.readFileSync(path.join(process.cwd(), ...)) is invisible to that, so
     * on a serverless host it is simply absent and the route 500s with ENOENT.
     *
     * Listed per-route rather than with a wildcard: a glob over public/art
     * made the trace crawl every file in the project and the build stopped
     * finishing.
     */
    outputFileTracingIncludes: {
      '/api/infographic/[id]': [
        './data/events.json',
        './data/events.vectors.json',
        './data/model/triage.json',
        './src/lib/schema.sql',
        './public/art/hero/*.png',
        './public/art/icon/*.png',
        './public/art/backdrop/*.png',
      ],
      '/api/ingest': ['./data/events.json', './data/events.vectors.json', './data/precedents.seed.json', './src/lib/schema.sql'],
      '/api/decisions': ['./data/events.json', './data/events.vectors.json', './data/precedents.seed.json', './src/lib/schema.sql'],
      '/api/artifacts': ['./data/events.json', './data/events.vectors.json', './data/precedents.seed.json', './src/lib/schema.sql'],
      '/api/reports': ['./data/events.json', './data/events.vectors.json', './data/precedents.seed.json', './src/lib/schema.sql'],
      '/inbox': ['./data/model/triage.json'],
      '/metrics': ['./data/model/evaluation.json', './data/model/triage.json'],
    },
  },

  // better-sqlite3 is a native addon; keep it out of the bundler.
  webpack: (config) => {
    config.externals = [...(config.externals || []), 'better-sqlite3'];
    return config;
  },
};

export default nextConfig;
