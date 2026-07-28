# Geeves.Life — Cloud Run image
# Build stage: full deps (incl. devDeps) to run vite build + esbuild bundle.
FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9 --activate
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile || pnpm install
COPY . .
# vite build (client) + esbuild server/_core/index.ts --packages=external (server)
# Externalized imports resolve at RUNTIME — so the final image needs prod node_modules.
RUN pnpm build

# Runtime stage: production deps only (vite/@builder.io are dev-only and now
# dynamically imported, so they are not needed here).
FROM node:22-slim
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9 --activate
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --prod --frozen-lockfile || pnpm install --prod
COPY --from=build /app/dist ./dist
ENV NODE_ENV=production
# Cloud Run injects PORT (default 8080); server binds 0.0.0.0:$PORT.
EXPOSE 8080
CMD ["node", "dist/index.js"]
