
FROM node:23-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build


FROM node:23-alpine

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
# HoloClaw reads /app/agent-packs/holoclaw/agent-pack.yaml at boot for its
# menu items, workspace limits, live-feed config, and speaker-tag format.
# Without this copy the runtime image would fall back to upstream defaults
# and lose every HoloClaw-specific contextual menu item.
COPY --from=builder /app/agent-packs ./agent-packs


CMD ["node", "dist/main.js"]
