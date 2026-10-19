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

# Self-contained Prisma CLI bundle for the runtime entrypoint, which applies
# pending migrations at startup. `prisma` is a devDependency of @tailor/api and
# therefore not part of the production install above; installing it into its
# own prefix keeps the production tree free of development tooling while the
# install scripts still fetch the schema-engine binary at build time. The
# version follows the backend package.json pin so the CLI always matches the
# generated client.
RUN PRISMA_VERSION="$(node -p "require('./backend/package.json').devDependencies.prisma")" \
  && mkdir -p /app/migrate-cli \
  && npm install --prefix /app/migrate-cli --no-audit --no-fund --no-package-lock --no-save "prisma@${PRISMA_VERSION}" \
  && node /app/migrate-cli/node_modules/prisma/build/index.js --version

FROM base AS runtime

ENV NODE_ENV=production \
    PORT=3000

COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=production-dependencies --chown=node:node /app/migrate-cli ./migrate-cli
COPY --from=build --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build --chown=node:node /app/backend/dist ./backend/dist
COPY --from=build --chown=node:node /app/backend/package.json ./backend/package.json
COPY --from=build --chown=node:node /app/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=node:node /app/packages/shared/package.json ./packages/shared/package.json
# Migration files travel with the runtime image: the entrypoint runs
# `prisma migrate deploy` from /app and the server verifies at startup that no
# migration is pending (see backend/src/schema-check.ts).
COPY --from=build --chown=node:node /app/backend/prisma ./prisma
COPY --from=build --chown=node:node /app/backend/docker-entrypoint.sh ./docker-entrypoint.sh

USER node

EXPOSE 3000

# start-period covers migration time on first boot after a release.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/backend/api/v1/health').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1))"

# The entrypoint applies pending migrations (prisma migrate deploy) before
# starting the API so application code never runs against a stale schema.
# Set SKIP_DB_MIGRATE=1 to skip applying migrations and only verify that none
# are pending (for setups that migrate in a separate release step).
ENTRYPOINT ["sh", "docker-entrypoint.sh"]
CMD ["node", "backend/dist/server.js"]
