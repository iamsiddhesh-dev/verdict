# One container: Next.js, the WebSocket server, the run worker and Tectonic.
# Runs as uid 1000 on the port in $PORT, which suits Hugging Face Spaces (Docker)
# and any other host that runs a plain image.

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl libfontconfig1 \
  && rm -rf /var/lib/apt/lists/*

# Tectonic's official installer drops a single binary in the current directory.
RUN cd /usr/local/bin && curl --proto '=https' --tlsv1.2 -fsSL https://drop-sh.fullyjustified.net | sh && tectonic --version

ENV NODE_ENV=production \
    PORT=7860 \
    XDG_CACHE_HOME=/app/.cache
WORKDIR /app
COPY --from=build --chown=node:node /app ./
USER node

# Compile the resume template once at build time, so the packages it needs are
# already cached and the first real resume does not wait on downloads.
RUN mkdir -p /tmp/warm && node node_modules/tsx/dist/cli.mjs scripts/warm-tectonic.ts /tmp/warm/warm.tex \
  && tectonic --untrusted --chatter minimal --outdir /tmp/warm /tmp/warm/warm.tex && rm -rf /tmp/warm

EXPOSE 7860
CMD ["node", "node_modules/tsx/dist/cli.mjs", "server.ts", "--prod"]
