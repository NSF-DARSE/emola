/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emits .next/standalone for container hosts. Vercel ignores it and builds
  // its own bundle, so leaving it on costs nothing and keeps Docker working.
  output: 'standalone',

  experimental: {
    /*
     * The supported way to keep a native addon out of the bundle.
     *
     * A webpack `externals` entry stops it being bundled but does NOT tell the
     * file tracer to ship it, so on a serverless host the require resolves to
     * nothing and every page touching the database 500s. This does both.
     */
    serverComponentsExternalPackages: ['better-sqlite3'],

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
      // The compiled binary itself. Tracing follows JS imports and will not
      // find a .node file on its own.
      '/**': ['./node_modules/better-sqlite3/build/Release/*.node'],
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

};

export default nextConfig;
