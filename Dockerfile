# Geeves.Life — Cloud Run image
# Build stage: full deps (incl. devDeps) to run vite build + esbuild bundle.
FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile || pnpm install
COPY . .
# vite build (client) + esbuild server/_core/index.ts --packages=external (server)
# Externalized imports resolve at RUNTIME — so the final image needs prod node_modules.
RUN pnpm build
# Prune devDependencies in-place so we can copy the trimmed node_modules to runtime.
RUN pnpm prune --prod

# Runtime stage: copy pruned node_modules from build stage (avoids lockfile mismatch
# and ensures all production packages including @google-cloud/* are present).
FROM node:22-slim
WORKDIR /app
# package.json is required for ESM resolution ("type": "module") and for
# node_modules package lookups at runtime.
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/start.mjs ./start.mjs
ENV NODE_ENV=production
# Cloud Run injects PORT (default 8080); server binds 0.0.0.0:$PORT.
EXPOSE 8080
CMD ["node", "start.mjs"]
