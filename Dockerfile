FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY . .
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
    pnpm install --frozen-lockfile && pnpm build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATABASE_URL=file:/data/prepa-cahier.db
COPY --from=build /app /app
VOLUME /data
EXPOSE 3000
# tsx is a dependency of the server package.
WORKDIR /app/apps/server
CMD ["node_modules/.bin/tsx", "src/index.ts"]
