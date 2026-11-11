FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATABASE_URL=file:/data/prepa-cahier.db
COPY --from=build /app /app
VOLUME /data
EXPOSE 3000
CMD ["node_modules/.bin/tsx", "apps/server/src/index.ts"]
