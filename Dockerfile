# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:22-slim AS build
WORKDIR /app

# Enable pnpm via corepack
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

# Install dependencies first (cached layer)
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY . .
RUN pnpm build
# Result: dist/index.js (server bundle) + dist/public/ (Vite client bundle)

# ── Stage 2: Production runtime ───────────────────────────────────────────────
FROM node:22-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
# Cloud Run injects PORT; default to 8080 for local docker run
ENV PORT=8080

# Install only production dependencies
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate && \
    pnpm install --frozen-lockfile --prod

# Copy built artifacts from build stage
COPY --from=build /app/dist ./dist

# Run as non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 geeves && \
    chown -R geeves:nodejs /app
USER geeves

EXPOSE 8080

# Health check for Cloud Run readiness probe
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:'+process.env.PORT+'/api/health', r => process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/index.js"]
