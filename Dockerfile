FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable

# ── deps ──────────────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json* ./
COPY packages/server/package.json ./packages/server/
COPY packages/admin/package.json  ./packages/admin/
COPY packages/game/package.json   ./packages/game/
RUN npm ci

# ── build frontends ───────────────────────────────────────────────────────────
FROM deps AS build-admin
COPY packages/admin ./packages/admin
RUN npm run build -w packages/admin

FROM deps AS build-game
COPY packages/game ./packages/game
RUN npm run build -w packages/game

# ── build server ──────────────────────────────────────────────────────────────
FROM deps AS build-server
COPY packages/server ./packages/server
RUN npm run build -w packages/server

# ── runtime ───────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
RUN apk add --no-cache vips-dev  # required by sharp
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/server/node_modules ./packages/server/node_modules
COPY --from=build-server /app/packages/server/dist ./packages/server/dist
COPY --from=build-server /app/packages/server/package.json ./packages/server/package.json

# Copy built frontends into server's public folder so Fastify can serve them
COPY --from=build-admin /app/packages/admin/dist ./packages/server/dist/public/admin
COPY --from=build-game  /app/packages/game/dist  ./packages/server/dist/public/game

# Tenant data is mounted as a volume at runtime
VOLUME ["/app/tenants"]
COPY tenants/_defaults /app/tenants/_defaults

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "packages/server/dist/index.js"]
