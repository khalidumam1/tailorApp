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

# Self-contained Prisma CLI bundle for the runtime entrypoint, which applies
# pending migrations at startup. `prisma` is a devDependency and therefore not
# part of the production install above; installing it into its own prefix keeps
# the production tree free of development tooling while the install scripts
# still fetch the schema-engine binary at build time. The version follows the
# backend package.json pin so the CLI always matches the generated client.
RUN PRISMA_VERSION="$(node -p "require('./package.json').devDependencies.prisma")" \
  && mkdir -p /app/migrate-cli \
  && npm install --prefix /app/migrate-cli --no-audit --no-fund --no-package-lock --no-save "prisma@${PRISMA_VERSION}" \
  && node /app/migrate-cli/node_modules/prisma/build/index.js --version

FROM base AS runtime

ENV NODE_ENV=production \
    PORT=3000

COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=production-dependencies --chown=node:node /app/migrate-cli ./migrate-cli
COPY --from=build --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/shared ./shared
# Migration files travel with the runtime image: the entrypoint runs
# `prisma migrate deploy` from /app and the server verifies at startup that no
# migration is pending (see src/schema-check.ts).
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/docker-entrypoint.sh ./docker-entrypoint.sh

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
CMD ["node", "dist/server.js"]
