# One container: Next.js, the WebSocket server, the run worker and Tectonic.
# Sized for small free instances (Koyeb: 0.1 vCPU, 512 MB): the server is
# precompiled at build time, and Tectonic's packages are cached in the image.

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm run build:server && npm prune --omit=dev

FROM node:22-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

# Tectonic, the statically linked build: one file, no system libraries needed.
ARG TECTONIC_VERSION=0.17.0
RUN curl -fsSL "https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40${TECTONIC_VERSION}/tectonic-${TECTONIC_VERSION}-x86_64-unknown-linux-musl.tar.gz" \
  | tar -xz -C /usr/local/bin tectonic && tectonic --version

ENV NODE_ENV=production \
    PORT=8000 \
    HOST=0.0.0.0 \
    XDG_CACHE_HOME=/app/.cache \
    WORKER_CONCURRENCY=2 \
    NODE_OPTIONS=--max-old-space-size=320
WORKDIR /app
RUN chown node:node /app
COPY --from=build --chown=node:node /app ./
USER node

# Compile the resume template once, so the LaTeX packages it needs are already in
# the image and the first real resume does not wait on downloads.
RUN mkdir -p /tmp/warm && node node_modules/tsx/dist/cli.mjs scripts/warm-tectonic.ts /tmp/warm/warm.tex \
  && tectonic --untrusted --chatter minimal --outdir /tmp/warm /tmp/warm/warm.tex && rm -rf /tmp/warm

EXPOSE 8000
CMD ["node", "dist/server.mjs", "--prod"]
