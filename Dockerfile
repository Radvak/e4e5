# Dependencies first, from the package files only: this stage (and the large node_modules
# layer of the final image) stays cached until a package.json or the lockfile changes, so a
# new version only rebuilds the small layers with the code.
FROM node:22-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .pnpmfile.cjs ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
COPY packages/data/package.json packages/data/
COPY tools/stats/package.json tools/stats/
# Optional build secrets for a corporate network (not kept in the image; unused elsewhere):
#   ca: extra CA of a TLS proxy; npmrc: npm config with a mirror registry (+ token).
#   docker build --secret id=ca,src=ca.crt --secret id=npmrc,src=npmrc .
RUN --mount=type=secret,id=ca,required=false \
    --mount=type=secret,id=npmrc,required=false,target=/root/.npmrc \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    if [ -f /root/.npmrc ]; then \
      export COREPACK_NPM_REGISTRY="$(sed -n 's/^registry=//p' /root/.npmrc)"; \
      token="$(sed -n 's/.*:_authToken=//p' /root/.npmrc | head -1)"; \
      if [ -n "$token" ]; then export COREPACK_NPM_TOKEN="$token"; fi; \
    fi; \
    pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATABASE_URL=file:/data/e4e5.db
COPY --from=deps /app/node_modules /app/node_modules
COPY --from=build /app/package.json /app/pnpm-workspace.yaml /app/
COPY --from=build /app/packages/core /app/packages/core
COPY --from=build /app/packages/data /app/packages/data
COPY --from=build /app/apps/server /app/apps/server
COPY --from=build /app/apps/web/dist /app/apps/web/dist
VOLUME /data
EXPOSE 3000
# The server is compiled to dist/index.js at build time (fast start, no TypeScript at boot).
WORKDIR /app/apps/server
CMD ["node", "--enable-source-maps", "dist/index.js"]
