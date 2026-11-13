# syntax=docker/dockerfile:1.7
# One image, three entrypoints:
#   web      node server.js          (default)
#   worker   node dist/worker.mjs
#   migrate  node dist/migrate.mjs   (Helm pre-install/pre-upgrade Job)

ARG NODE_VERSION=22-alpine

FROM node:${NODE_VERSION} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

FROM node:${NODE_VERSION} AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build && npm run build:jobs

FROM node:${NODE_VERSION} AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    MIGRATIONS_DIR=/app/drizzle
RUN addgroup -S -g 1001 crewlane && adduser -S -u 1001 -G crewlane crewlane
COPY --from=build --chown=1001:1001 /app/.next/standalone ./
COPY --from=build --chown=1001:1001 /app/.next/static ./.next/static
COPY --from=build --chown=1001:1001 /app/dist ./dist
COPY --from=build --chown=1001:1001 /app/drizzle ./drizzle
USER 1001
EXPOSE 3000 8081
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "server.js"]
