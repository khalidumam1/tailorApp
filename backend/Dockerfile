FROM node:22-bookworm-slim AS base

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

FROM base AS build

ARG DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build

COPY . .

RUN npm ci \
  && npm run db:generate \
  && npm run build:shared \
  && npm run build

FROM build AS migrate

ENV NODE_ENV=production

CMD ["npm", "run", "db:migrate"]

FROM base AS production-dependencies

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/shared ./shared

RUN npm ci --omit=dev --ignore-scripts

FROM base AS runtime

ENV NODE_ENV=production \
    PORT=3000

COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/shared ./shared

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/backend/api/v1/health').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1))"

CMD ["node", "dist/server.js"]
