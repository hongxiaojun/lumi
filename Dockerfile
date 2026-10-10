FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY server/index.mjs ./server/index.mjs
ENV PORT=8080
ENV LEAF_LIBRARY_DIR=/data/library
VOLUME ["/data/library"]
EXPOSE 8080
CMD ["node", "server/index.mjs"]
