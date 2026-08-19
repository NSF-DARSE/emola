# Runs the app anywhere that takes a container: AWS App Runner, ECS, GCP Cloud
# Run, or plain Docker on a VM.
#
# Multi-stage on purpose. better-sqlite3 and sharp are native addons, so they
# must be COMPILED ON LINUX — copying node_modules from a Windows checkout
# produces a binary the container cannot load, and the failure looks like a
# missing module rather than a wrong architecture.

# ---- deps: compile native modules against this exact platform --------------
FROM node:20-slim AS deps
WORKDIR /app
# node-gyp needs a toolchain to build better-sqlite3 from source.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN npm ci

# ---- build: produce the standalone server ----------------------------------
FROM node:20-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- run: only what the server needs --------------------------------------
FROM node:20-slim AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

# Standalone omits files it cannot see being imported, so the data the app
# reads at runtime is copied explicitly.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/data ./data
COPY --from=build /app/src/lib/schema.sql ./src/lib/schema.sql

# Native addons are excluded from the bundle, so they ship as real modules.
COPY --from=deps /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY --from=deps /app/node_modules/bindings ./node_modules/bindings
COPY --from=deps /app/node_modules/file-uri-to-path ./node_modules/file-uri-to-path

# Do not run as root.
USER node

EXPOSE 8080
CMD ["node", "server.js"]
