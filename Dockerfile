# The production image (ADR 0005): one Node process serving the API and the built web app on one origin.
#   docker build --build-arg GIT_SHA=$(git rev-parse HEAD) -t fodr .
#   docker run -p 3000:3000 --env-file production.env fodr   (every variable in .env.example; see apps/api/src/config.ts)
# The web app's error tracking is a build argument instead (SENTRY_DSN_WEB, #43), since the browser bundle carries it.
# Migrations are applied explicitly before a release, with the same image (ADR 0008):
#   docker run -e DATABASE_URL=postgres://... fodr node apps/api/dist/migrate.mjs
#   docker run -e DATABASE_URL=postgres://... fodr node apps/api/dist/import-products.mjs   (#35, before the API starts)
# The tag is the newest Node 24 release at least two weeks old (docs/architecture.md).

FROM node:24.22.1-bookworm-slim AS build
WORKDIR /app
# Manifests first, so the dependency layer is reused until one of them changes.
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY packages/domain/package.json packages/domain/
COPY packages/contracts/package.json packages/contracts/
RUN npm ci
COPY . .
# Error tracking in the browser (#43): the web app's Sentry DSN (public by design) and environment are built into the
# bundle, with the commit as its release. Without SENTRY_DSN_WEB the image still builds, with no reports from browsers.
#   docker build --build-arg GIT_SHA=... --build-arg SENTRY_DSN_WEB=https://...ingest.de.sentry.io/... -t fodr .
ARG GIT_SHA
ARG SENTRY_DSN_WEB=
ARG SENTRY_ENVIRONMENT=production
RUN VITE_SENTRY_DSN="$SENTRY_DSN_WEB" VITE_SENTRY_ENVIRONMENT="$SENTRY_ENVIRONMENT" VITE_APP_VERSION="$GIT_SHA" \
    npm run build
# The catalogue is served by the API, never bundled with the web app (#27).
RUN node apps/web/scripts/check-bundle.mjs

FROM node:24.22.1-bookworm-slim
# The environment the reports name, the same for the API as for the browser bundle built above (#43); the runtime
# SENTRY_ENVIRONMENT still overrides the API's.
ARG SENTRY_ENVIRONMENT=production
# The commit the image is built from, recorded with every saved plan as its engine version (CF5, #27). Required: an
# image that cannot say which code computed its plans is not built.
ARG GIT_SHA
RUN test -n "$GIT_SHA" || { echo 'Build with --build-arg GIT_SHA=$(git rev-parse HEAD)' >&2; exit 1; }
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    WEB_DIST_DIR=/app/apps/web/dist \
    APP_VERSION=$GIT_SHA \
    SENTRY_ENVIRONMENT=$SENTRY_ENVIRONMENT
# The API is bundled with its dependencies (apps/api/build.mjs), so no node_modules is needed.
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/drizzle apps/api/drizzle
COPY --from=build /app/apps/web/dist apps/web/dist
USER node
EXPOSE 3000
CMD ["node", "--enable-source-maps", "apps/api/dist/main.mjs"]
