# The production image (ADR 0005): one Node process serving the API and the built web app on one origin.
#   docker build --build-arg GIT_SHA=$(git rev-parse HEAD) -t fodr .
#   docker run -p 3000:3000 --env-file production.env fodr   (every variable in .env.example; see apps/api/src/config.ts)
# Migrations are applied explicitly before a release, with the same image (ADR 0008):
#   docker run -e DATABASE_URL=postgres://... fodr node apps/api/dist/migrate.mjs
# The tag is the newest Node 24 release at least two weeks old (docs/architecture.md).

FROM node:24.21.0-bookworm-slim AS build
WORKDIR /app
# Manifests first, so the dependency layer is reused until one of them changes.
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY packages/domain/package.json packages/domain/
COPY packages/contracts/package.json packages/contracts/
RUN npm ci
COPY . .
RUN npm run build

FROM node:24.21.0-bookworm-slim
# The commit the image is built from, recorded with every saved plan as its engine version (CF5, #27).
ARG GIT_SHA=unknown
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    WEB_DIST_DIR=/app/apps/web/dist \
    APP_VERSION=$GIT_SHA
# The API is bundled with its dependencies (apps/api/build.mjs), so no node_modules is needed.
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/drizzle apps/api/drizzle
COPY --from=build /app/apps/web/dist apps/web/dist
USER node
EXPOSE 3000
CMD ["node", "--enable-source-maps", "apps/api/dist/main.mjs"]
