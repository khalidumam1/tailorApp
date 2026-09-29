FROM node:22-bookworm-slim AS base

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

FROM base AS build

ARG DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build

COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY web/package.json web/package.json
COPY mobile/package.json mobile/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci

COPY . .

RUN npm run db:generate \
  && npm run build --workspace @tailor/shared \
  && npm run build --workspace @tailor/api

FROM build AS migrate

ENV NODE_ENV=production
USER node

CMD ["npm", "run", "db:migrate"]

FROM base AS production-dependencies

COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY web/package.json web/package.json
COPY mobile/package.json mobile/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci --omit=dev --ignore-scripts --workspace=@tailor/api --workspace=@tailor/shared

FROM base AS runtime

ENV NODE_ENV=production \
    PORT=3000

COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build --chown=node:node /app/backend/dist ./backend/dist
COPY --from=build --chown=node:node /app/backend/package.json ./backend/package.json
COPY --from=build --chown=node:node /app/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=node:node /app/packages/shared/package.json ./packages/shared/package.json

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/v1/health').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1))"

CMD ["node", "backend/dist/server.js"]
